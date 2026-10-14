import type { Request, Response } from 'express';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';

// LRU In-memory Cache for synthesized audio buffers
interface CachedAudio {
  data: string; // base64 encoded WAV audio
  mimeType: string;
  provider: string;
  voiceId: string;
  timestamp: number;
}

const AUDIO_CACHE = new Map<string, CachedAudio>();
const MAX_CACHE_SIZE = 120;

function getCacheKey(provider: string, voiceId: string, emotion: string, text: string): string {
  return `${provider.toLowerCase()}:${voiceId.toLowerCase()}:${emotion.toLowerCase()}:${text.trim().toLowerCase()}`;
}

function addToCache(key: string, data: string, mimeType: string, provider: string, voiceId: string) {
  if (AUDIO_CACHE.size >= MAX_CACHE_SIZE) {
    const oldestKey = AUDIO_CACHE.keys().next().value;
    if (oldestKey) AUDIO_CACHE.delete(oldestKey);
  }
  AUDIO_CACHE.set(key, { data, mimeType, provider, voiceId, timestamp: Date.now() });
}

export interface SynthesisRecord {
  timestamp: number;
  provider: 'browser' | 'gemini' | 'google-cloud';
  voiceId: string;
  success: boolean;
  source?: string;
  isQuotaExceeded?: boolean;
  error?: string;
  latencyMs?: number;
}

let lastSynthesisRecord: SynthesisRecord | null = null;

export interface TTSVoiceMeta {
  id: string;
  name: string;
  gender: 'female' | 'male';
  provider: 'gemini' | 'google-cloud' | 'browser';
  language: string;
  description: string;
  expressiveQuality: string;
}

export const PREMIUM_VOICE_CATALOG: TTSVoiceMeta[] = [
  {
    id: 'Aoede',
    name: 'Aoede (Gemini 3.8 Flash Lite TTS)',
    gender: 'female',
    provider: 'gemini',
    language: 'hi-IN / en-IN / Hinglish',
    description: 'Warm, natural, friendly, expressive young female tone. Exceptional for conversational Hinglish.',
    expressiveQuality: 'Warm & Natural',
  },
  {
    id: 'Kore',
    name: 'Kore (Gemini 3.8 Flash Lite TTS)',
    gender: 'female',
    provider: 'gemini',
    language: 'hi-IN / en-IN / Hinglish',
    description: 'Bright, crisp, articulate, friendly female tone. Great clarity on English loanwords in Hindi.',
    expressiveQuality: 'Bright & Articulate',
  },
  {
    id: 'hi-IN-Chirp3-HD-Aoede',
    name: 'Google Cloud Chirp 3 HD Hindi (Aoede)',
    gender: 'female',
    provider: 'google-cloud',
    language: 'hi-IN',
    description: 'Google Cloud Text-to-Speech Chirp 3 HD studio quality voice for Hindi and Hinglish.',
    expressiveQuality: 'HD Studio',
  },
  {
    id: 'hi-IN-Chirp3-HD-Kore',
    name: 'Google Cloud Chirp 3 HD Hindi (Kore)',
    gender: 'female',
    provider: 'google-cloud',
    language: 'hi-IN',
    description: 'Google Cloud Text-to-Speech Chirp 3 HD studio quality voice with crisp articulation.',
    expressiveQuality: 'HD Studio',
  },
  {
    id: 'en-IN-Chirp3-HD-Aoede',
    name: 'Google Cloud Chirp 3 HD Indian English (Aoede)',
    gender: 'female',
    provider: 'google-cloud',
    language: 'en-IN',
    description: 'Google Cloud Text-to-Speech Chirp 3 HD studio voice for Indian English.',
    expressiveQuality: 'HD Studio',
  },
  {
    id: 'en-IN-Chirp3-HD-Kore',
    name: 'Google Cloud Chirp 3 HD Indian English (Kore)',
    gender: 'female',
    provider: 'google-cloud',
    language: 'en-IN',
    description: 'Google Cloud Text-to-Speech Chirp 3 HD studio voice with crisp Indian enunciation.',
    expressiveQuality: 'HD Studio',
  },
];

/**
 * Resolves the effective provider and compatible voice ID based on:
 * 1. Client-requested provider and voice (e.g. from user Settings)
 * 2. Server environment variables: TTS_PROVIDER and TTS_VOICE_ID
 * 3. Provider/Voice compatibility mappings (preventing Gemini voices sent to GCP, and vice-versa)
 */
export function resolveProviderAndVoice(
  clientProvider?: string,
  clientVoiceId?: string,
  detectedLanguage: string = 'hinglish'
): {
  provider: 'browser' | 'gemini' | 'google-cloud';
  voiceId: string;
  sourceOfProvider: 'client' | 'env' | 'auto-fallback';
} {
  const envProvider = (process.env.TTS_PROVIDER || '').trim().toLowerCase();
  const envVoiceId = (process.env.TTS_VOICE_ID || '').trim();
  const googleCloudKey = process.env.GOOGLE_CLOUD_TTS_API_KEY || process.env.GOOGLE_CLOUD_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  // Determine target provider:
  // - If client explicitly requested 'browser', 'gemini', or 'google-cloud' (not 'auto'), respect client choice
  // - Otherwise, respect server environment variable TTS_PROVIDER if set
  // - Otherwise, default to 'browser' (or auto-detect if keys exist)
  let provider: 'browser' | 'gemini' | 'google-cloud' = 'browser';
  let sourceOfProvider: 'client' | 'env' | 'auto-fallback' = 'auto-fallback';

  if (clientProvider && clientProvider !== 'auto') {
    if (clientProvider === 'gemini' || clientProvider === 'google-cloud' || clientProvider === 'browser') {
      provider = clientProvider;
      sourceOfProvider = 'client';
    }
  } else if (envProvider && envProvider !== 'browser') {
    if (envProvider === 'gemini' || envProvider === 'google-cloud') {
      provider = envProvider as any;
      sourceOfProvider = 'env';
    }
  } else {
    // Client provider is 'auto' (or omitted) and envProvider is not an explicit cloud override.
    // Determine provider based on requested voice persona and available keys:
    const cand = (clientVoiceId?.trim() || envVoiceId || 'Aoede').toLowerCase();
    if (cand.includes('chirp') || cand.startsWith('hi-in-') || cand.startsWith('en-in-')) {
      provider = 'google-cloud';
      sourceOfProvider = 'auto-fallback';
    } else if (geminiKey) {
      // Default premium provider for Aoede and Kore is Gemini TTS
      provider = 'gemini';
      sourceOfProvider = 'auto-fallback';
    } else if (googleCloudKey) {
      provider = 'google-cloud';
      sourceOfProvider = 'auto-fallback';
    } else {
      provider = 'browser';
      sourceOfProvider = 'auto-fallback';
    }
  }

  // Voice ID candidate: client preference takes priority over env default
  const candidateVoice = clientVoiceId?.trim() || envVoiceId || 'Aoede';

  // Ensure strict provider and voice compatibility:
  let finalVoiceId = candidateVoice;

  if (provider === 'gemini') {
    // Gemini 3.8 Flash Lite TTS supports prebuilt voices: 'Aoede', 'Kore', 'Puck', 'Charon', 'Fenrir'
    // If incoming voice is a Google Cloud voice ID (e.g. 'hi-IN-Chirp3-HD-Kore'), map it safely to 'Kore'
    if (candidateVoice.toLowerCase().includes('kore')) {
      finalVoiceId = 'Kore';
    } else {
      finalVoiceId = 'Aoede';
    }
  } else if (provider === 'google-cloud') {
    // Google Cloud Text-to-Speech requires voice names formatted like: <lang>-Chirp3-HD-<voice_name>
    // NEVER send a raw Gemini voice ID like 'Aoede' or 'Kore' to Google Cloud TTS!
    const isEnglish = detectedLanguage === 'english';
    const langPrefix = isEnglish ? 'en-IN' : 'hi-IN';

    if (candidateVoice.toLowerCase() === 'kore') {
      finalVoiceId = `${langPrefix}-Chirp3-HD-Kore`;
    } else if (candidateVoice.toLowerCase() === 'aoede') {
      finalVoiceId = `${langPrefix}-Chirp3-HD-Aoede`;
    } else if (candidateVoice.includes('Chirp3-HD')) {
      finalVoiceId = candidateVoice;
    } else {
      // Default to Aoede Chirp 3 HD with appropriate language tag
      finalVoiceId = `${langPrefix}-Chirp3-HD-Aoede`;
    }
  } else {
    // Browser voice: keep candidate or browser default
    finalVoiceId = candidateVoice || 'browser-default';
  }

  return { provider, voiceId: finalVoiceId, sourceOfProvider };
}

/**
 * Synthesizes speech using Gemini 3.8 Flash Lite TTS
 */
async function synthesizeWithGemini(
  text: string,
  voiceId: string = 'Aoede',
  emotion: string = 'neutral'
): Promise<{ base64Audio: string; mimeType: string; latencyMs: number }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on server');
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  // Ensure only valid Gemini voice names are dispatched
  const validVoice = voiceId.toLowerCase().includes('kore') ? 'Kore' : 'Aoede';

  // Build natural stylistic direction based on emotion
  let stylePrompt = 'Warm, friendly, natural Hindi-English assistant';
  if (emotion === 'playful' || emotion === 'funny') {
    stylePrompt = 'Playful, lively, friendly conversational Hindi-English female assistant';
  } else if (emotion === 'excited') {
    stylePrompt = 'Upbeat, enthusiastic, energized conversational female assistant';
  } else if (emotion === 'calm' || emotion === 'reassuring' || emotion === 'empathetic') {
    stylePrompt = 'Gentle, soothing, reassuring friendly female assistant';
  }

  const startTime = Date.now();
  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash-lite-tts',
    contents: [
      {
        role: 'user',
        parts: [
          {
            text,
            speechMetadata: {
              style: stylePrompt,
            },
          },
        ],
      },
    ] as any,
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: validVoice },
        },
      },
    },
  });

  const latencyMs = Date.now() - startTime;
  const part = response.candidates?.[0]?.content?.parts?.[0];
  const base64Audio = part?.inlineData?.data;
  const mimeType = part?.inlineData?.mimeType || 'audio/wav';

  if (!base64Audio) {
    throw new Error('No audio data received from Gemini TTS model');
  }

  return { base64Audio, mimeType, latencyMs };
}

/**
 * Synthesizes speech using Google Cloud Text-to-Speech REST API (Chirp 3 HD)
 */
async function synthesizeWithGoogleCloud(
  text: string,
  voiceId: string
): Promise<{ base64Audio: string; mimeType: string; latencyMs: number }> {
  const apiKey = process.env.GOOGLE_CLOUD_TTS_API_KEY || process.env.GOOGLE_CLOUD_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_CLOUD_TTS_API_KEY is not configured on server');
  }

  // Double-check voice formatting: must not be a bare name like 'Aoede'
  let validatedVoice = voiceId;
  if (!validatedVoice.includes('-')) {
    validatedVoice = `hi-IN-Chirp3-HD-${voiceId}`;
  }

  const langCode = validatedVoice.startsWith('en-IN') ? 'en-IN' : 'hi-IN';
  const startTime = Date.now();

  const res = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: { text },
      voice: {
        languageCode: langCode,
        name: validatedVoice,
        ssmlGender: 'FEMALE',
      },
      audioConfig: {
        audioEncoding: 'LINEAR16', // uncompressed WAV
        sampleRateHertz: 24000,
      },
    }),
  });

  const latencyMs = Date.now() - startTime;
  const data = await res.json();
  if (data.error) {
    throw new Error(data.error.message || `Google Cloud Text-to-Speech failed with HTTP ${res.status}`);
  }

  if (!data.audioContent) {
    throw new Error('Google Cloud TTS returned empty audio content');
  }

  return {
    base64Audio: data.audioContent,
    mimeType: 'audio/wav',
    latencyMs,
  };
}

async function parseBody(req: any): Promise<any> {
  if (req.body && typeof req.body === 'object') return req.body;
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk: any) => {
      raw += chunk;
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve({});
      }
    });
  });
}

function sendJson(res: any, status: number, data: any) {
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    return res.status(status).json(data);
  }
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

/**
 * Handles POST /api/tts
 */
export async function handleTTSRequest(req: any, res: any) {
  try {
    const body = await parseBody(req);
    const {
      text,
      voiceId: requestedVoice,
      emotion = 'neutral',
      provider: requestedProvider,
      detectedLanguage = 'hinglish',
      isSamplePreview = false,
    } = body || {};

    if (!text || typeof text !== 'string' || !text.trim()) {
      return sendJson(res, 400, {
        success: false,
        error: 'Missing or empty "text" parameter',
        fallbackToBrowser: true,
      });
    }

    const cleanText = text.trim();

    // 1. Resolve effective provider and compatible voice
    const resolution = resolveProviderAndVoice(
      requestedProvider,
      requestedVoice,
      detectedLanguage
    );
    const { provider, voiceId, sourceOfProvider } = resolution;

    // 2. ONLY serve pre-rendered audio if EXPLICITLY requested as a sample preview!
    // Never hijack live synthesis or make live generation appear successful without calling the provider.
    if (isSamplePreview) {
      const normalizedKey = cleanText.toLowerCase().replace(/[^a-z0-9]/g, '');
      const BENCHMARK_SAMPLES: Record<string, number> = {
        bossaajkyaplanhaikuchinterestingkartehain: 1,
        chaloabisenergykousekarkekuchdhamakedarkartehain: 2,
        aajmereserversthodezyadahihappymoodmeinhain: 3,
        mainabhitumharihelpkartihoon: 4,
        waitbosspehlepooribaattohsunlo: 5,
      };

      if (BENCHMARK_SAMPLES[normalizedKey]) {
        const sampleNum = BENCHMARK_SAMPLES[normalizedKey];
        const targetVoice = voiceId.toLowerCase().includes('kore') ? 'kore' : 'aoede';
        const samplePath = path.resolve(
          process.cwd(),
          `public/audio_samples/${targetVoice}_sentence_${sampleNum}.wav`
        );
        if (fs.existsSync(samplePath)) {
          const fileBuffer = fs.readFileSync(samplePath);
          const base64Data = fileBuffer.toString('base64');
          return sendJson(res, 200, {
            success: true,
            source: 'sample-preview',
            isSamplePreview: true,
            provider,
            voiceId,
            mimeType: 'audio/wav',
            audioData: base64Data,
            latencyMs: 5,
          });
        }
      }
    }

    // 3. If target provider is 'browser', return immediate fallback signal (0ms, no API calls)
    if (provider === 'browser') {
      return sendJson(res, 200, {
        success: false,
        fallbackToBrowser: true,
        reason: 'Browser voice selected as active engine',
        provider: 'browser',
        sourceOfProvider,
      });
    }

    // 4. Check in-memory LRU cache (isolated by provider + voiceId + emotion + text)
    const cacheKey = getCacheKey(provider, voiceId, emotion, cleanText);
    if (AUDIO_CACHE.has(cacheKey)) {
      const cached = AUDIO_CACHE.get(cacheKey)!;
      // Double check entry provider matches requested provider
      if (cached.provider === provider && cached.voiceId === voiceId) {
        return sendJson(res, 200, {
          success: true,
          source: 'cache',
          provider,
          voiceId,
          mimeType: cached.mimeType,
          audioData: cached.data,
          latencyMs: 1,
        });
      }
    }

    // 5. Credential verification before executing live calls
    const googleCloudKey = process.env.GOOGLE_CLOUD_TTS_API_KEY || process.env.GOOGLE_CLOUD_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;

    if (provider === 'google-cloud' && !googleCloudKey) {
      lastSynthesisRecord = {
        timestamp: Date.now(),
        provider: 'google-cloud',
        voiceId,
        success: false,
        error: 'GOOGLE_CLOUD_TTS_API_KEY is not configured on server',
      };
      return sendJson(res, 200, {
        success: false,
        fallbackToBrowser: true,
        error: 'GOOGLE_CLOUD_TTS_API_KEY is not configured on server',
        provider: 'google-cloud',
      });
    }

    if (provider === 'gemini' && !geminiKey) {
      lastSynthesisRecord = {
        timestamp: Date.now(),
        provider: 'gemini',
        voiceId,
        success: false,
        error: 'GEMINI_API_KEY is not configured on server',
      };
      return sendJson(res, 200, {
        success: false,
        fallbackToBrowser: true,
        error: 'GEMINI_API_KEY is not configured on server',
        provider: 'gemini',
      });
    }

    // 6. Attempt live synthesis with 9000ms timeout guard (allows natural complete answers)
    const synthesisPromise = (async () => {
      if (provider === 'google-cloud') {
        return await synthesizeWithGoogleCloud(cleanText, voiceId);
      } else if (provider === 'gemini') {
        return await synthesizeWithGemini(cleanText, voiceId, emotion);
      } else {
        throw new Error(`Unsupported TTS provider: ${provider}`);
      }
    })();

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('TTS request timed out after 9000ms')), 9000)
    );

    const result = await Promise.race([synthesisPromise, timeoutPromise]);

    // Save to LRU cache under provider-isolated key
    addToCache(cacheKey, result.base64Audio, result.mimeType, provider, voiceId);

    lastSynthesisRecord = {
      timestamp: Date.now(),
      provider,
      voiceId,
      success: true,
      source: 'live',
      latencyMs: result.latencyMs,
    };

    return sendJson(res, 200, {
      success: true,
      source: 'live',
      provider,
      voiceId,
      mimeType: result.mimeType,
      audioData: result.base64Audio,
      latencyMs: result.latencyMs,
    });
  } catch (err: any) {
    const isQuota =
      err?.message?.includes('quota') ||
      err?.message?.includes('429') ||
      err?.message?.includes('RESOURCE_EXHAUSTED');

    lastSynthesisRecord = {
      timestamp: Date.now(),
      provider: 'gemini',
      voiceId: 'Aoede',
      success: false,
      isQuotaExceeded: Boolean(isQuota),
      error: isQuota
        ? 'Gemini TTS daily quota limit reached (HTTP 429)'
        : (err?.message || 'Synthesis failed'),
    };

    console.warn(
      `[TTS] Synthesis notice (${isQuota ? 'Quota Limit Reached' : err?.message}) -> Falling back to browser voice gracefully`
    );

    return sendJson(res, 200, {
      success: false,
      fallbackToBrowser: true,
      error: isQuota
        ? 'Gemini TTS daily quota limit reached (HTTP 429)'
        : (err?.message || 'Synthesis failed'),
      isQuotaExceeded: Boolean(isQuota),
      provider: 'gemini',
      voiceId: 'Aoede',
    });
  }
}

/**
 * Handles GET /api/tts/status
 */
export async function handleTTSStatusRequest(_req: any, res: any) {
  const envProvider = (process.env.TTS_PROVIDER || 'browser').toLowerCase();
  const envVoiceId = (process.env.TTS_VOICE_ID || '').trim();
  const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY);
  const hasGoogleCloudKey = Boolean(
    process.env.GOOGLE_CLOUD_TTS_API_KEY || process.env.GOOGLE_CLOUD_API_KEY
  );

  let statusState: 'premium-ready' | 'browser-fallback' | 'config-required' = 'premium-ready';
  let statusLabel = 'Premium Ready';
  let statusMessage = '';

  if (lastSynthesisRecord && Date.now() - lastSynthesisRecord.timestamp < 3600000) {
    if (lastSynthesisRecord.success) {
      statusState = 'premium-ready';
      statusLabel = 'Premium Ready';
      statusMessage = `Live premium synthesis verified (${lastSynthesisRecord.provider} - ${lastSynthesisRecord.voiceId})`;
    } else if (lastSynthesisRecord.isQuotaExceeded) {
      statusState = 'browser-fallback';
      statusLabel = 'Browser Fallback (Quota 429)';
      statusMessage = 'Gemini TTS daily quota limit reached (HTTP 429) — temporarily using device browser voice';
    } else if (lastSynthesisRecord.error?.includes('not configured')) {
      statusState = 'config-required';
      statusLabel = 'Configuration Required';
      statusMessage = lastSynthesisRecord.error;
    } else {
      statusState = 'browser-fallback';
      statusLabel = 'Browser Fallback Active';
      statusMessage = lastSynthesisRecord.error || 'Temporary browser fallback active';
    }
  } else {
    if (envProvider === 'google-cloud' && !hasGoogleCloudKey) {
      statusState = 'config-required';
      statusLabel = 'Configuration Required';
      statusMessage = 'Google Cloud Chirp 3 HD requires GOOGLE_CLOUD_TTS_API_KEY in server environment';
    } else if (hasGeminiKey) {
      statusState = 'premium-ready';
      statusLabel = 'Premium Ready';
      statusMessage = 'Gemini 3.8 Flash Lite TTS ready (Aoede & Kore)';
    } else if (hasGoogleCloudKey) {
      statusState = 'premium-ready';
      statusLabel = 'Premium Ready';
      statusMessage = 'Google Cloud Chirp 3 HD ready';
    } else {
      statusState = 'config-required';
      statusLabel = 'Configuration Required';
      statusMessage = 'Cloud TTS API keys not configured on server';
    }
  }

  const sampleFiles = [
    'aoede_sentence_1.wav',
    'aoede_sentence_2.wav',
    'aoede_sentence_3.wav',
    'aoede_sentence_4.wav',
    'aoede_sentence_5.wav',
    'kore_sentence_1.wav',
    'kore_sentence_2.wav',
    'kore_sentence_3.wav',
    'kore_sentence_4.wav',
    'kore_sentence_5.wav',
  ];

  const availableSamples: string[] = [];
  const samplesDir = path.resolve(process.cwd(), 'public/audio_samples');
  if (fs.existsSync(samplesDir)) {
    for (const f of sampleFiles) {
      if (fs.existsSync(path.join(samplesDir, f))) {
        availableSamples.push(f);
      }
    }
  }

  return sendJson(res, 200, {
    statusState,
    statusLabel,
    statusMessage,
    lastSynthesisRecord,
    activeProvider: envProvider,
    defaultVoiceId: envVoiceId || (envProvider === 'google-cloud' ? 'hi-IN-Chirp3-HD-Aoede' : 'Aoede'),
    defaultFallback: 'browser',
    hasGeminiKey,
    hasGoogleCloudKey,
    voices: PREMIUM_VOICE_CATALOG,
    availablePreRenderedSamples: availableSamples,
    pricing: {
      browser: {
        cost: 'Free ($0.00)',
        latency: '0ms (On-device Web Speech API)',
        offline: true,
      },
      geminiFlashLiteTTS: {
        cost: '$0.075 / 1M text characters + $10.00 / 1M audio tokens (~$0.002/min audio)',
        latency: '~1.8s - 3.2s',
        freeTierQuota: '10 requests/day on Gemini free tier',
      },
      googleCloudChirp3HD: {
        cost: '$16.00 to $32.00 per 1M characters (Standard voices free up to 4M chars/month)',
        latency: '~400ms - 900ms',
        requiresKey: true,
      },
    },
  });
}
