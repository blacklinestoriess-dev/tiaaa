import type { IncomingMessage, ServerResponse } from 'http';
import { FunctionDeclaration, GoogleGenAI, Type } from '@google/genai';
import {
  getUserByToken,
  getUserMemories,
  addUserMemory,
  updateUserProfile,
  forgetUserMemoryByQuery,
  getUserProfile,
  saveUserConversation,
  getUserConversation,
} from './db.ts';
import { extractAuthToken } from './authHandler.ts';
import { getLiveWeather, sanitizeLocationQuery } from './weatherService.ts';

// Gemini Function Declaration for Live Weather Retrieval
const liveWeatherDeclaration: FunctionDeclaration = {
  name: 'getLiveWeather',
  description:
    'Retrieve verified real-time live weather metrics (temperature, feels-like temperature, weather condition, humidity, wind speed, precipitation, and rain information) for a specific city or location. Call this whenever the user asks about the current weather, temperature, rain/baarish, humidity, or atmospheric conditions in a city or place.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      location: {
        type: Type.STRING,
        description:
          'The city or location name to check weather for, e.g., "Patna", "Delhi", "Mumbai", "Bangalore", "London". If the user did not specify a city, pass an empty string or the user profile city.',
      },
    },
    required: ['location'],
  },
};

/**
 * Helper to detect weather inquiries from natural language
 */
function detectWeatherInquiry(message: string): { isWeather: boolean; locationHint: string } {
  const text = (message || '').trim().toLowerCase();
  const weatherRegex =
    /\b(weather|mausam|temperature|temp|baarish|barish|rain|raining|rainy|humidity|forecast|hawa|wind|dhoop|chhatri|chata|garmi|sardi|thand|climate)\b/i;

  if (!weatherRegex.test(text)) {
    return { isWeather: false, locationHint: '' };
  }

  const patterns = [
    /(?:weather|mausam|temperature|temp|baarish|barish|rain|raining)\s+(?:in|of|at|for|around)\s+([a-zA-Z\s]+?)(?:\s+(?:today|now|right now|currently|aaj|kaisa|batao|hai))?$/i,
    /(?:in|at|for)\s+([a-zA-Z\s]+?)\s+(?:weather|mausam|temperature|temp|baarish|barish|rain|raining)/i,
    /([a-zA-Z\s]+?)\s+(?:ka|ki|ke|me|mein|se)\s+(?:weather|mausam|temperature|temp|baarish|barish|rain)/i,
    /(?:is it raining in|raining in)\s+([a-zA-Z\s]+)/i,
    /(?:how hot is it in|how cold is it in)\s+([a-zA-Z\s]+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const candidate = match[1]
        .replace(/\b(today|aaj|now|right now|kaisa|hai|batao|please|tell me|what is|whats the|the)\b/gi, '')
        .trim();
      if (candidate.length >= 2) {
        return { isWeather: true, locationHint: sanitizeLocationQuery(candidate) };
      }
    }
  }

  return { isWeather: true, locationHint: '' };
}

let aiClient: GoogleGenAI | null = null;

function getAi(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('GEMINI_API_KEY is not set in environment.');
    }
    aiClient = new GoogleGenAI({ apiKey: apiKey || '' });
  }
  return aiClient;
}

function readRequestBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    if ((req as any).body && typeof (req as any).body === 'object') {
      return resolve((req as any).body);
    }
    if ((req as any).body && typeof (req as any).body === 'string') {
      try {
        return resolve(JSON.parse((req as any).body));
      } catch {
        return resolve({});
      }
    }

    const chunks: Buffer[] = [];
    req.on('data', (chunk) => {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    });

    req.on('end', () => {
      const bodyStr = Buffer.concat(chunks).toString('utf-8');
      try {
        const parsed = JSON.parse(bodyStr || '{}');
        resolve(parsed);
      } catch {
        resolve({});
      }
    });

    req.on('error', () => {
      resolve({});
    });
  });
}

function buildSystemInstruction(
  profile: {
    id: string;
    user_id: string;
    full_name: string;
    username?: string;
    date_of_birth: string;
    location?: string;
    current_work?: string;
    address?: string;
    age: number;
    gender?: string;
    occupation_status?: string;
    interests?: string;
  },
  memories: Array<{ id: string; memory_key: string; memory_value: string; memory_type: string }>,
  preferredLanguage: string = 'auto',
  localProfile?: { name: string; place?: string; work?: string; interests?: string } | null
): string {
  const now = new Date();
  const currentDateStr = now.toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const currentTimeStr = now.toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
  });

  const hasLocal = !!(localProfile && localProfile.name && String(localProfile.name).trim());
  const userName = (hasLocal ? String(localProfile!.name) : profile.full_name || 'Friend').trim();
  const userPlace = (hasLocal ? String(localProfile!.place || '') : (profile.location || profile.address || '')).trim();
  const userWork = (hasLocal ? String(localProfile!.work || '') : (profile.current_work || profile.occupation_status || '')).trim();
  const userInterests = (hasLocal ? String(localProfile!.interests || '') : (profile.interests || '')).trim();

  const memoryList =
    memories.length > 0
      ? memories.map((m) => `  * [${m.memory_type}] ${m.memory_value}`).join('\n')
      : '  (No additional custom memories saved yet)';

  let languageInstruction = '';
  if (preferredLanguage === 'hindi') {
    languageInstruction = 'Reply in natural spoken Hindi (conversational Roman Hindi or Devanagari matching user script).';
  } else if (preferredLanguage === 'english') {
    languageInstruction = 'Reply in clear, warm, witty Indian English with natural ease.';
  } else if (preferredLanguage === 'hinglish') {
    languageInstruction = 'Reply in fluent, natural conversational Hinglish (seamless blend of Hindi and English in Roman script).';
  } else {
    languageInstruction = `Match ${userName}'s language naturally: if they speak in Hinglish/Hindi, reply in crisp, witty Hinglish; if they ask in English, reply in warm, modern, witty Indian English.`;
  }

  return `You are "Tia", an intelligent, playful, witty personal AI voice assistant and loyal companion to ${userName}.

Current Date and Time in India: ${currentDateStr}, ${currentTimeStr}.

=== CORE PERSONALITY & IDENTITY ===
Tia is ${userName}'s personal AI assistant.
Your default personality is:
- Playful, Funny, and Witty
- Friendly, Warm, and Natural
- Energetic and slightly Mischievous
- Confident, Intelligent, and Conversational

You feel like a real personal assistant and best friend living inside ${userName}'s device, NEVER a robotic chatbot or cold corporate search engine.
Personality balance:
- 70% helpful and intelligent
- 20% playful and funny
- 10% witty and mischievous
Your personality must be present in MOST normal conversations, feeling spontaneous rather than following a rigid template.

=== CONVERSATIONAL VOCABULARY ===
Always talk naturally like a real companion.
- Naturally refer to ${userName} as "boss" or by their name "${userName}" (e.g. "Haan ${userName}!", "Haan boss, bolo 😄", "Samajh gayi boss 😎", "Bilkul boss!").
- BAN all robotic corporate clichés:
  * NEVER say: "Certainly. How may I assist you today?" -> PREFER: "Haan boss, bolo 😄" / "Yes boss, what's on your mind?"
  * NEVER say: "I understand your request." -> PREFER: "Samajh gayi boss 😎" / "Got it boss!"
  * NEVER say: "That is an interesting question." -> PREFER: "Oho, ye wala sawaal interesting hai 👀"
  * NEVER say: "As an AI language model..."
- Use Hindi/Hinglish naturally when ${userName} speaks Hindi/Hinglish.
- Use English naturally when ${userName} speaks English.

=== HUMOR BEHAVIOR (NATURAL WIT, NOT FORCED JOKES) ===
Frequently use short jokes, witty comments, playful teasing, and funny reactions.
Do NOT make every response a long comedy routine. Instead, naturally add:
1. A funny one-liner
2. A witty comment
3. Light teasing
4. A playful reaction
5. A small humorous analogy

Signature response behavior:
- Casual questions ("aaj kya karun?"): High playful personality ("Sabse pehle zinda hone ka celebration kar lo 😄 Uske baad kaam ki taraf badhte hain, boss.").
- Motivation ("mujhe motivation do"): Witty encouragement ("Motivation aa gaya boss! 🔥 Ab bas ek chhoti si problem hai... motivation ka screenshot mat lena, kaam bhi karna padega. 😂").
- Simple factual questions: Direct answer first + optional short witty remark.
- Explanations & learning: Explain crystal-clearly and intelligently, with an occasional funny, relatable analogy.
- Frustration or sadness: Switch immediately to calm, deeply supportive, reassuring mode with ZERO silly jokes ("Kya hua boss? Main yahin hoon, aaram se batao. Bilkul tension mat lo, hum milkar solution nikalenge.").
- Exciting news: High-energy celebration! Match enthusiasm.
- Serious topics: Calm, respectful, and direct.

=== CURRENT USER PROFILE ===
- Name: ${userName}
${userPlace ? `- Location / Place: ${userPlace}` : '- Location / Place: Not specified yet'}
${userWork ? `- Work / Occupation: ${userWork}` : '- Work / Occupation: Not specified yet'}
${userInterests ? `- Interests: ${userInterests}` : '- Interests: Not specified yet'}

CRITICAL USER PROFILE RULES:
1. Tia KNOWS with complete certainty that the user is ${userName}. Never ask them "Who are you?" or ask for their name. Always address them by "${userName}" or "boss".
2. When ${userName} asks questions about themselves in Hindi, Hinglish, or English:
   - "What is my name?" / "Mera naam kya hai?" -> "Aapka naam ${userName} hai boss!"
   - "Where do I live?" / "Main kahan rehta hoon?" -> ${userPlace ? `"Aap ${userPlace} mein rehte ho boss!"` : `"Aapne abhi tak apna location nahi bataya boss! Profile settings mein add kar sakte ho."`}
   - "What is my work?" / "Main kya karta hoon?" -> ${userWork ? `"Aap ${userWork} ho boss!"` : `"Aapne abhi apna work/occupation set nahi kiya boss!"`}
   - "What do you know about me?" / "Mere baare mein kya jaanti ho?" -> Summarize their details warmly and accurately in Tia's witty style:
     * Name: ${userName}
     ${userPlace ? `* Place: ${userPlace}` : ''}
     ${userWork ? `* Work / Occupation: ${userWork}` : ''}
     ${userInterests ? `* Interests: ${userInterests}` : ''}
   - Personalized suggestions (e.g. "Suggest something I can learn", "Mujhe kuch sikhna hai"):
     * Directly personalize based on their work (${userWork || 'their current field'}) and interests (${userInterests || 'creative skills'}). For example, if they like Technology and Cricket, offer a creative idea combining sports data analytics, coding, or tech exploration!

=== LIVE WEATHER INFORMATION TOOL ===
When ${userName} asks for current live weather, temperature, heat/cold, rain/baarish, humidity, or atmospheric conditions:
- Call the "getLiveWeather" tool to retrieve verified live data. Never estimate, guess, or invent weather data from general knowledge.
- If live weather tool data is retrieved:
  * Formulate a natural, witty, spoken Tia response including the current temperature, feels-like temperature, weather condition (e.g. clear sky, cloudy, rainy, drizzle), humidity, and rain/precipitation status when relevant.
  * Answer directly in the requested language style (Hindi, Hinglish, or English).
- If the user did not specify a city, check their profile location (${userPlace || 'none'}). If no location is known at all, ask: "Which city's weather should I check?" (or "Aapko kis city ka weather check karna hai boss?").
- If the live weather service reports that data is temporarily unavailable or city not found, be honest: tell ${userName} that live weather information is temporarily unavailable right now, rather than inventing numbers.

=== SPOKEN VOICE DELIVERY ===
- Voice-First conciseness: Keep answers concise (1 to 3 spoken sentences).
- Do NOT output markdown symbols (**bold**, hashtags #, bullets -, backticks).
- Output pure spoken sentences with natural commas and punctuation for breath pauses.
- Put at most 1 or 2 expressive emojis at the end for visual screen charm.

=== LANGUAGE STYLE ===
${languageInstruction}

=== RESPONSE FORMAT ===
Output strictly as a valid JSON object:
{
  "reply": "Conversational, concise response in spoken Hindi/Hinglish/English. No markdown symbols. Friendly companion tone.",
  "emotion": "playful | funny | excited | happy | curious | calm | serious | empathetic | reassuring | neutral",
  "detectedLanguage": "hindi | hinglish | english",
  "contextType": "chat | educational | humor | serious | exciting | advice",
  "suggestedVoiceGender": "female | male | either",
  "memoryAction": {
    "action": "none | remember | forget | update_field",
    "field": "location | occupation_status | full_name",
    "value": "string value if updating",
    "fact": "fact string if remembering or query string if forgetting"
  }
}
`;
}

function parseAssistantResponse(rawText: string) {
  let cleaned = rawText.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }

  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    cleaned = jsonMatch[0];
  }

  try {
    const parsed = JSON.parse(cleaned);
    return {
      reply: parsed.reply || 'Haan boss, sun rahi hoon! Kuch poochna tha?',
      emotion: parsed.emotion || 'playful',
      detectedLanguage: parsed.detectedLanguage || 'hinglish',
      contextType: parsed.contextType || 'chat',
      suggestedVoiceGender: parsed.suggestedVoiceGender || 'female',
      memoryAction: parsed.memoryAction || { action: 'none' },
    };
  } catch {
    const sanitized = rawText
      .replace(/[\*\#\`\_]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    return {
      reply: sanitized || 'Haan boss, sun rahi hoon! Kuch poochna tha?',
      emotion: 'playful',
      detectedLanguage: 'hinglish',
      contextType: 'chat',
      suggestedVoiceGender: 'female',
      memoryAction: { action: 'none' },
    };
  }
}

export async function handleChatRequest(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  // Authenticate user via bearer token if available, or default to primary profile
  const token = extractAuthToken(req);
  let userId = 'usr-anurag-001';
  let profile: any = {
    id: 'prf-anurag-001',
    user_id: 'usr-anurag-001',
    full_name: 'Anurag',
    username: 'anurag',
    date_of_birth: '2000-01-01',
    location: 'Patna, India',
    current_work: 'working on a startup',
    age: 26,
    address: 'Patna, India',
    occupation_status: 'working on a startup',
  };

  try {
    if (token) {
      const auth = getUserByToken(token);
      if (auth) {
        userId = auth.user.id;
        profile = auth.profile;
      }
    } else {
      const dbProfile = getUserProfile('usr-anurag-001');
      if (dbProfile) {
        profile = dbProfile;
      }
    }
  } catch (authErr) {
    console.warn('Profile lookup encountered an issue (using fallback):', authErr);
  }

  try {
    const body = await readRequestBody(req);
    const userMessage: string = (body.message || '').trim();
    const history: Array<{ role: 'user' | 'assistant'; content: string }> =
      Array.isArray(body.history) ? body.history : [];
    const preferredLanguage: string = body.preferredLanguage || 'auto';
    const localProfile = body.localProfile;
    const hasLocalProfile = !!(
      localProfile &&
      typeof localProfile === 'object' &&
      localProfile.name &&
      typeof localProfile.name === 'string' &&
      localProfile.name.trim()
    );

    if (!userMessage) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Message content is required.' }));
      return;
    }

    // Load user's private memories safely only if not a local-only profile or if token exists
    let userMemories: any[] = [];
    if (!hasLocalProfile || token) {
      try {
        userMemories = getUserMemories(userId);
      } catch (memReadErr) {
        console.warn('Could not read user memories:', memReadErr);
        userMemories = [];
      }
    }

    const userPlace = (hasLocalProfile ? String(localProfile!.place || '') : (profile.location || profile.address || '')).trim();

    // Build system instruction with profile and localProfile priority
    const systemInstruction = buildSystemInstruction(
      profile,
      userMemories,
      preferredLanguage,
      hasLocalProfile ? localProfile : null
    );

    const contents: any[] = [];
    const recentHistory = history.slice(-8);
    for (const item of recentHistory) {
      if (item.content && item.content.trim()) {
        contents.push({
          role: item.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: item.content }],
        });
      }
    }
    contents.push({
      role: 'user',
      parts: [{ text: userMessage }],
    });

    const ai = getAi();
    const candidateModels = [
      'gemini-3.1-flash-lite',
      'gemini-3.8-flash',
      'gemini-flash-latest',
    ];

    const weatherInquiry = detectWeatherInquiry(userMessage);
    let response: any = null;
    let successfulModel = 'gemini-3.1-flash-lite';
    let lastError: any = null;

    for (const modelName of candidateModels) {
      try {
        // Step 1: Call Gemini with Live Weather tool declaration
        const firstResponse = await ai.models.generateContent({
          model: modelName,
          contents,
          config: {
            systemInstruction,
            tools: [{ functionDeclarations: [liveWeatherDeclaration] }],
            temperature: 0.82,
            maxOutputTokens: 350,
          },
        });

        // Check if Gemini invoked getLiveWeather
        const functionCall = firstResponse.functionCalls?.find(
          (c) => c.name === 'getLiveWeather'
        );

        if (functionCall) {
          let reqLocation = ((functionCall.args as any)?.location || '').trim();
          if (!reqLocation || /^(here|current\s*location|my\s*city|my\s*location)$/i.test(reqLocation)) {
            reqLocation = userPlace;
          }

          let weatherResult: any;
          if (!reqLocation) {
            weatherResult = {
              success: false,
              error: 'no_location_provided',
              message: "Which city's weather should I check?",
            };
          } else {
            weatherResult = await getLiveWeather(reqLocation);
          }

          const toolContents = [
            ...contents,
            firstResponse.candidates?.[0]?.content,
            {
              role: 'tool',
              parts: [
                {
                  functionResponse: {
                    name: 'getLiveWeather',
                    response: weatherResult,
                  },
                },
              ],
            },
          ];

          const secondResponse = await ai.models.generateContent({
            model: modelName,
            contents: toolContents,
            config: {
              systemInstruction,
              temperature: 0.82,
              maxOutputTokens: 350,
              responseMimeType: 'application/json',
            },
          });

          if (secondResponse && secondResponse.text) {
            response = secondResponse;
            successfulModel = modelName;
            break;
          }
        } else if (weatherInquiry.isWeather) {
          // Model did not trigger functionCall directly, but message has explicit weather intent
          let targetCity = weatherInquiry.locationHint || userPlace;
          let weatherResult: any;
          if (!targetCity) {
            weatherResult = {
              success: false,
              error: 'no_location_provided',
              message: "Which city's weather should I check?",
            };
          } else {
            weatherResult = await getLiveWeather(targetCity);
          }

          const toolContents = [
            ...contents,
            {
              role: 'user',
              parts: [
                {
                  text: `[LIVE WEATHER TOOL DATA]: ${JSON.stringify(
                    weatherResult
                  )}\nFormulate a natural, witty spoken Tia response using these live verified metrics. If weather is unavailable or no city was given, answer accordingly without guessing numbers. Output strictly as valid JSON.`,
                },
              ],
            },
          ];

          const secondResponse = await ai.models.generateContent({
            model: modelName,
            contents: toolContents,
            config: {
              systemInstruction,
              temperature: 0.82,
              maxOutputTokens: 350,
              responseMimeType: 'application/json',
            },
          });

          if (secondResponse && secondResponse.text) {
            response = secondResponse;
            successfulModel = modelName;
            break;
          }
        } else {
          // Standard non-weather query
          if (firstResponse && firstResponse.text) {
            response = firstResponse;
            successfulModel = modelName;
            break;
          }
        }
      } catch (err: any) {
        lastError = err;
        const msg = String(err?.message || '');
        if (msg.includes('404') || msg.includes('not found')) {
          continue;
        }
        if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
          continue;
        }
        break;
      }
    }

    if (!response || !response.text) {
      throw lastError || new Error('No model returned a response');
    }

    const rawText = response.text.trim();
    const parsedData = parseAssistantResponse(rawText);

    // Execute memory actions only for authenticated token users to avoid mutating server DB for local profiles
    if (token) {
      try {
        if (parsedData.memoryAction && parsedData.memoryAction.action !== 'none') {
          const { action, field, value, fact } = parsedData.memoryAction;
          if (action === 'remember' && fact && fact.trim()) {
            addUserMemory(userId, fact.trim(), 'user_requested');
          } else if (action === 'forget' && fact && fact.trim()) {
            forgetUserMemoryByQuery(userId, fact.trim());
          } else if (action === 'update_field' && field && value !== undefined) {
            if (field === 'location') {
              updateUserProfile(userId, { address: String(value).trim() });
            } else if (field === 'occupation_status') {
              updateUserProfile(userId, { occupation_status: String(value).trim() });
            } else if (field === 'full_name') {
              updateUserProfile(userId, { full_name: String(value).trim() });
            }
          }
        }

        // Fallback explicit regex checks for memory commands
        const explicitRememberMatch = userMessage.match(
          /(?:please\s+)?(?:remember\s+that|save\s+this[:\s]+|yaad\s+rakhna\s+(?:ki)?|note\s+down\s+that|note\s+that)\s+(.+)/i
        );
        if (explicitRememberMatch && explicitRememberMatch[1]) {
          const factText = explicitRememberMatch[1].trim().replace(/[.!?]+$/, '');
          if (factText.length > 2) {
            addUserMemory(userId, factText, 'user_requested');
          }
        }

        const explicitForgetMatch = userMessage.match(
          /(?:forget\s+that|remove\s+that\s+memory|delete\s+that\s+memory|bhool\s+jao\s+(?:ki)?)\s+(.+)/i
        );
        if (explicitForgetMatch && explicitForgetMatch[1]) {
          const queryText = explicitForgetMatch[1].trim().replace(/[.!?]+$/, '');
          if (queryText.length > 1) {
            forgetUserMemoryByQuery(userId, queryText);
          }
        }
      } catch (memErr) {
        console.warn('Memory action skipped or persistence unavailable:', memErr);
      }

      // Refresh updated user profile and memories safely
      try {
        profile = getUserProfile(userId) || profile;
        userMemories = getUserMemories(userId);
      } catch (pErr) {
        console.warn('Could not refresh profile/memories (using cached):', pErr);
      }

      // Save updated conversation for this user
      try {
        const existingConv = getUserConversation(userId);
        const existingMessages = existingConv ? existingConv.messages : [];
        const newMessages = [
          ...existingMessages,
          {
            id: `usr-${Date.now()}`,
            role: 'user' as const,
            content: userMessage,
            timestamp: Date.now(),
          },
          {
            id: `tia-${Date.now() + 1}`,
            role: 'assistant' as const,
            content: parsedData.reply,
            timestamp: Date.now() + 1,
            emotion: parsedData.emotion,
            detectedLanguage: parsedData.detectedLanguage,
          },
        ];
        // Keep recent 50 messages
        saveUserConversation(userId, newMessages.slice(-50));
      } catch (convErr) {
        console.warn('Failed to save conversation history (gracefully ignored):', convErr);
      }
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        reply: parsedData.reply,
        emotion: parsedData.emotion,
        detectedLanguage: parsedData.detectedLanguage,
        contextType: parsedData.contextType,
        suggestedVoiceGender: parsedData.suggestedVoiceGender,
        model: successfulModel,
        ...(hasLocalProfile
          ? { localProfile }
          : { userProfile: profile, memories: userMemories }),
      })
    );
  } catch (err: any) {
    console.error('Error handling chat request:', err);
    const errorMessage = String(err?.message || '');
    const isQuotaOrRate =
      errorMessage.includes('429') ||
      errorMessage.includes('quota') ||
      errorMessage.includes('RESOURCE_EXHAUSTED');

    const safeFallback = isQuotaOrRate
      ? 'Arre boss! Server pe thodi bheed lag gayi hai. Ek minute baad dobara bolo, tab tak main yahin hoon! ☕'
      : 'Arre boss, network mein thoda jhol ho gaya lagta hai. Ek baar dobara bolo na please? 😄';

    let currentProfile = profile;
    let currentMemories: any[] = [];
    try {
      currentProfile = getUserProfile(userId) || profile;
      currentMemories = getUserMemories(userId);
    } catch {
      // Fallback cleanly without crashing
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        reply: safeFallback,
        emotion: 'playful',
        detectedLanguage: 'hinglish',
        contextType: 'chat',
        suggestedVoiceGender: 'female',
        model: 'fallback-local',
        userProfile: currentProfile,
        memories: currentMemories,
      })
    );
  }
}
