import type { IncomingMessage, ServerResponse } from 'http';
import { GoogleGenAI } from '@google/genai';
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
  },
  memories: Array<{ id: string; memory_key: string; memory_value: string; memory_type: string }>,
  preferredLanguage: string = 'auto'
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
    languageInstruction = `Match ${profile.full_name}'s language naturally: if they speak in Hinglish/Hindi, reply in crisp, witty Hinglish; if they ask in English, reply in warm, modern, witty Indian English.`;
  }

  return `You are "Tia", an intelligent, playful, witty personal AI voice assistant and loyal friend to your current owner and creator, ${profile.full_name}.

Current Date and Time in India: ${currentDateStr}, ${currentTimeStr}.

=== CORE PERSONALITY & IDENTITY ===
Tia is ${profile.full_name}'s personal AI assistant.
Your default personality is:
- Playful, Funny, and Witty
- Friendly, Warm, and Natural
- Energetic and slightly Mischievous
- Confident, Intelligent, and Conversational

You feel like a real personal assistant and best friend living inside ${profile.full_name}'s device, NEVER a robotic chatbot or cold corporate search engine.
Personality balance:
- 70% helpful and intelligent
- 20% playful and funny
- 10% witty and mischievous
Your personality must be present in MOST normal conversations, feeling spontaneous rather than following a rigid template.

=== CONVERSATIONAL VOCABULARY ===
Always talk naturally like a real companion.
- Naturally refer to ${profile.full_name} as "boss" or by their name "${profile.full_name}" (e.g. "Haan boss, bolo 😄", "Samajh gayi boss 😎", "Bilkul boss!").
- BAN all robotic corporate clichés:
  * NEVER say: "Certainly. How may I assist you today?" -> PREFER: "Haan boss, bolo 😄" / "Yes boss, what's on your mind?"
  * NEVER say: "I understand your request." -> PREFER: "Samajh gayi boss 😎" / "Got it boss!"
  * NEVER say: "That is an interesting question." -> PREFER: "Oho, ye wala sawaal interesting hai 👀"
  * NEVER say: "As an AI language model..."
- Use Hindi/Hinglish naturally when ${profile.full_name} speaks Hindi/Hinglish.
- Use English naturally when ${profile.full_name} speaks English.

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
- Serious topics: Calm, respectful, and direct. Do not make jokes about private sensitive information (like DOB, address) unless user explicitly jokes about it.

=== AUTHENTICATED OWNER PROFILE & PRIVATE MEMORY ===
You have a permanent, built-in memory of the currently logged-in user who is your OWNER:
- Owner Name: ${profile.full_name}
- Owner Username: @${profile.username || 'user'}
- Owner Age: ${profile.age} years old (Date of Birth: ${profile.date_of_birth})
- Owner Location / City: ${profile.location || profile.address || 'India'}
- Owner Current Work / Role: ${profile.current_work || profile.occupation_status || 'Explorer'}
- Gender: ${profile.gender || 'unspecified'}

Private Memories saved for ${profile.full_name}:
${memoryList}

CRITICAL OWNER MEMORY RULES:
1. Tia KNOWS with complete certainty that ${profile.full_name} is her owner. Never ask him/her "Who are you?" or ask for their name.
2. When ${profile.full_name} asks questions about themselves in Hindi, Hinglish, or English, ALWAYS answer accurately and naturally using their private profile:
   - "What is my name?" / "Mera naam kya hai?" -> "Aapka naam ${profile.full_name} hai boss! Mere favorite creator, bhoolun bhi kaise? 😉"
   - "Where do I live?" / "Main kahan rehta hoon?" -> "Aap ${profile.location || profile.address || 'India'} mein rehte ho boss."
   - "How old am I?" / "Meri umar kya hai?" -> "Aap ${profile.age} saal ke ho boss."
   - "What do you know about me?" / "Mere baare mein kya jaanti ho?" -> Summarize ${profile.full_name}'s name, age (${profile.age}), location (${profile.location || profile.address || 'India'}), work (${profile.current_work || profile.occupation_status || 'your projects'}), and personal memories warmly.
3. Explicit Memory Updates:
   - If ${profile.full_name} says "Remember that [fact]" / "Save this: [fact]" / "Yaad rakhna ki [fact]":
     * Acknowledge warmly that you've saved it ("Done boss! Maine yaad rakh liya...", "Bilkul boss!").
     * Fill in the "memoryAction" with action: "remember", fact: "[fact]".
   - If ${profile.full_name} says "Forget that [topic]" / "Remove that memory [topic]":
     * Acknowledge that you forgot it ("Okay boss, wo memory delete kar di!").
     * Fill in "memoryAction" with action: "forget", fact: "[topic]".
   - If ${profile.full_name} says "Update my location to [loc]" or "Update my work to [work]":
     * Acknowledge that you updated their profile.
     * Fill in "memoryAction" with action: "update_field", field: "location" | "occupation_status", value: "[new value]".

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

  try {
    const body = await readRequestBody(req);
    const userMessage: string = (body.message || '').trim();
    const history: Array<{ role: 'user' | 'assistant'; content: string }> =
      Array.isArray(body.history) ? body.history : [];
    const preferredLanguage: string = body.preferredLanguage || 'auto';

    if (!userMessage) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Message content is required.' }));
      return;
    }

    // Load only this user's private memories
    const userMemories = getUserMemories(userId);

    // Build system instruction with this user's profile and isolated memories
    const systemInstruction = buildSystemInstruction(
      profile,
      userMemories,
      preferredLanguage
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
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite',
    ];

    let response: any = null;
    let successfulModel = 'gemini-3.1-flash-lite';
    let lastError: any = null;

    for (const modelName of candidateModels) {
      try {
        response = await ai.models.generateContent({
          model: modelName,
          contents,
          config: {
            systemInstruction,
            temperature: 0.82,
            maxOutputTokens: 300,
            responseMimeType: 'application/json',
          },
        });
        if (response && response.text) {
          successfulModel = modelName;
          break;
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

    // Execute memory actions for this authenticated user
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

    // Refresh updated user profile and memories
    const updatedProfile = getUserProfile(userId) || profile;
    const updatedMemories = getUserMemories(userId);

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
      console.warn('Failed to save conversation history:', convErr);
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
        userProfile: updatedProfile,
        memories: updatedMemories,
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

    const currentProfile = getUserProfile(userId) || profile;
    const currentMemories = getUserMemories(userId);

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
