/**
 * Wake Word and Audio Cue services for Tia Assistant.
 * Provides on-device "Tia" wake phrase detection supporting English/Latin and Hindi/Devanagari
 * variants, audio wake chime playback, and browser microphone management.
 */

export interface WakeWordMatch {
  detected: boolean;
  remainderQuery: string;
  matchedPhrase?: string;
}

export interface WakeEvaluationResult {
  detected: boolean;
  matchedPhrase?: string;
  remainderQuery: string;
  matchedAlternative?: string;
  rawResult: string;
  normalizedResult: string;
}

/**
 * Controlled Latin wake word variants:
 * tia, tiya, tiyaa, teya, teeya, dia, diya, diyaa, piya,数据库, piyaa, ti, tea
 */
export const LATIN_WAKE_WORDS: readonly string[] = [
  'tia',
  'tiya',
  'tiyaa',
  'teya',
  'teeya',
  'dia',
  'diya',
  'diyaa',
  'piya',
  'piyaa',
  'ti',
  'tea',
];

const LATIN_WAKE_SET = new Set(LATIN_WAKE_WORDS);

/**
 * Controlled Devanagari wake word variants:
 * टिया, टियाा, टीया, तिया, तियाा, दिया, दीया, पिया, पीया, टी
 */
export const DEVANAGARI_WAKE_WORDS: readonly string[] = [
  'टिया',
  'टियाा',
  'टीया',
  'तिया',
  'तियाा',
  'दिया',
  'दीया',
  'पिया',
  'पीया',
  'टी',
];

const DEVANAGARI_WAKE_SET = new Set(DEVANAGARI_WAKE_WORDS);

/**
 * Greeting prefixes supported in Latin and Devanagari
 */
export const GREETING_PREFIXES: readonly string[] = [
  'hey',
  'hi',
  'hello',
  'suno',
  'ok',
  'okay',
  'ay',
  'oye',
  'हे',
  'सुनो',
  'नमस्ते',
  'ओए',
];

const GREETING_SET = new Set(GREETING_PREFIXES);

/**
 * Controlled transcript normalization:
 * - Unicode NFKC normalization
 * - Convert Latin text to lowercase
 * - Remove harmless punctuation (preserving Devanagari Unicode characters)
 * - Trim and normalize repeated whitespace
 */
export function normalizeTranscript(text: string): string {
  if (!text) return '';
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\u0964\u0965.,\/#!$%\^&\*;:{}=\-_`~()?"'’“”\r\n\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Detects whether candidate speech is an echo of Tia's recent spoken answer.
 */
export function isTiaVoiceEcho(
  candidateTranscript: string,
  lastTiaSpokenText: string
): boolean {
  if (!candidateTranscript || !lastTiaSpokenText) return false;

  const candNorm = normalizeTranscript(candidateTranscript);
  const tiaNorm = normalizeTranscript(lastTiaSpokenText);

  if (!candNorm || !tiaNorm) return false;
  if (candNorm.length < 5) return false;

  // Exact match
  if (candNorm === tiaNorm) return true;

  // Significant substring match (at least 15 chars or 4+ words to prevent matching short common phrases)
  if (tiaNorm.includes(candNorm) && (candNorm.length >= 15 || candNorm.split(' ').length >= 4)) {
    return true;
  }
  if (candNorm.includes(tiaNorm) && tiaNorm.length >= 15) {
    return true;
  }

  // Very high word overlap (>= 80% of longer distinctive words)
  const candWords = candNorm.split(' ').filter((w) => w.length > 3);
  const tiaWords = new Set(tiaNorm.split(' ').filter((w) => w.length > 3));

  if (candWords.length >= 4 && tiaWords.size > 0) {
    let matchingCount = 0;
    for (const word of candWords) {
      if (tiaWords.has(word)) {
        matchingCount++;
      }
    }
    if (matchingCount / candWords.length >= 0.8) {
      return true;
    }
  }

  return false;
}

/**
 * Validates that candidate speech is neither an acoustic echo nor an instant duplicate of the previous query.
 */
export function isStaleOrEchoTranscript(
  candidateTranscript: string,
  lastTiaSpokenText: string,
  lastUserQuery: string,
  lastTiaSpeechEndTime = 0
): boolean {
  if (!candidateTranscript) return true;
  const candNorm = normalizeTranscript(candidateTranscript);
  if (!candNorm || candNorm.length < 2) return true;

  // If speech ended more than 1.2 seconds ago, speakers are silent, so acoustic echo is impossible
  const isAcousticEchoPossible =
    lastTiaSpeechEndTime === 0 || Date.now() - lastTiaSpeechEndTime < 1200;

  if (isAcousticEchoPossible && isTiaVoiceEcho(candidateTranscript, lastTiaSpokenText)) {
    return true;
  }

  return false;
}

/**
 * Checks a single speech recognition result for any approved wake-word alias.
 * Supports:
 * 1. Standalone wake words (Latin & Devanagari)
 * 2. Greeting + wake word phrases ("hey tia", "hey diya", "hey tea", "हे टिया", etc.)
 * 3. Wake word followed by question query ("Tia, what is inflation?")
 * 4. Multi-word current result containing an approved wake alias as a separate word
 */
export function detectWakeWord(rawTranscript: string): WakeWordMatch {
  if (!rawTranscript) return { detected: false, remainderQuery: '' };
  const raw = rawTranscript.trim();
  if (!raw) return { detected: false, remainderQuery: '' };

  const normalized = normalizeTranscript(raw);
  if (!normalized) return { detected: false, remainderQuery: '' };

  const tokens = normalized.split(' ').filter(Boolean);
  if (tokens.length === 0) return { detected: false, remainderQuery: '' };

  let matchedWordCount = 0;
  let matchedPhrase = '';
  let matchStartIndex = -1;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const prevToken = i > 0 ? tokens[i - 1] : undefined;

    // Pattern A: Greeting + Wake Token ("hey tia", "hey diya", "hey tea", "हे टिया", "नमस्ते टिया", etc.)
    if (prevToken && GREETING_SET.has(prevToken) && (LATIN_WAKE_SET.has(token) || DEVANAGARI_WAKE_SET.has(token))) {
      matchedWordCount = 2;
      matchedPhrase = `${prevToken} ${token}`;
      matchStartIndex = i - 1;
      break;
    }

    // Pattern B: Direct Wake Token
    if (LATIN_WAKE_SET.has(token) || DEVANAGARI_WAKE_SET.has(token)) {
      // For short common English words ('ti' and 'tea'), ensure they are either:
      // - The only word in the result
      // - At index 0
      // - Preceded by a greeting prefix
      // to avoid false wake on arbitrary conversation
      if (token === 'ti' || token === 'tea') {
        if (tokens.length === 1 || i === 0 || (prevToken && GREETING_SET.has(prevToken))) {
          matchedWordCount = 1;
          matchedPhrase = token;
          matchStartIndex = i;
          break;
        }
      } else {
        // Distinct name aliases ('tia', 'tiya', 'dia', 'diya', 'piya', 'टिया', 'तिया', 'दिया', 'दीया', 'पिया', 'टी', etc.)
        matchedWordCount = 1;
        matchedPhrase = token;
        matchStartIndex = i;
        break;
      }
    }
  }

  if (matchedWordCount > 0 && matchStartIndex >= 0) {
    // Extract remainder from raw input to preserve original casing and characters
    let remainder = '';
    const words = matchedPhrase.split(' ');
    const pattern = words
      .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('[\\s,.:;!?\'"’\\-]+');
    const rx = new RegExp(pattern, 'i');
    const m = raw.match(rx);

    if (m && m.index !== undefined) {
      const rawAfter = raw.slice(m.index + m[0].length);
      remainder = rawAfter
        .replace(/^[\s,.:;!?\'"’\-—]+/, '')
        .replace(/^(?:suno|sun|suniye|ji|bolo|batao|bataiye|listen|सुनो|सुनिए|जी|बोलो|बताओ|बताइए)[\s,.:;!?\'"’\-—]*/i, '')
        .replace(/^[\s,.:;!?\'"’\-—]+/, '')
        .trim();
    } else {
      remainder = tokens.slice(matchStartIndex + matchedWordCount).join(' ').trim();
    }

    // Clean display name
    const displayMatched = matchedPhrase
      .split(' ')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');

    return {
      detected: true,
      remainderQuery: remainder,
      matchedPhrase: displayMatched,
    };
  }

  return { detected: false, remainderQuery: '' };
}

/**
 * Evaluates all speech recognition alternatives for a NEW SpeechRecognition result.
 * Checks alternatives in order: if any approved alias matches, triggers wake immediately.
 */
export function evaluateWakeAlternatives(
  alternatives: string[],
  sessionId?: number,
  isFinal?: boolean
): WakeEvaluationResult {
  if (!alternatives || alternatives.length === 0) {
    return {
      detected: false,
      remainderQuery: '',
      rawResult: '',
      normalizedResult: '',
    };
  }

  for (let idx = 0; idx < alternatives.length; idx++) {
    const alt = alternatives[idx];
    if (!alt || typeof alt !== 'string') continue;
    const match = detectWakeWord(alt);
    if (match.detected) {
      return {
        detected: true,
        matchedPhrase: match.matchedPhrase,
        remainderQuery: match.remainderQuery,
        matchedAlternative: alt,
        rawResult: alt,
        normalizedResult: normalizeTranscript(alt),
      };
    }
  }

  const primary = alternatives[0] || '';
  return {
    detected: false,
    remainderQuery: '',
    rawResult: primary,
    normalizedResult: normalizeTranscript(primary),
  };
}

/**
 * Plays a pleasant, subtle two-tone audio wake chime via Web Audio API.
 * Gives instantaneous auditory confirmation to the user that Tia woke up.
 */
export function playWakeChime(): void {
  if (typeof window === 'undefined') return;

  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    // Ascending major fifth chord tones (D5 587.33Hz -> A5 880Hz)
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    const gain2 = ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now); // D5
    gain1.gain.setValueAtTime(0.16, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880.0, now + 0.1); // A5
    gain2.gain.setValueAtTime(0.001, now);
    gain2.gain.setValueAtTime(0.18, now + 0.1);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);

    osc1.start(now);
    osc1.stop(now + 0.24);
    osc2.start(now + 0.1);
    osc2.stop(now + 0.4);

    // Auto-close audio context to conserve mobile resources
    setTimeout(() => {
      ctx.close().catch(() => {});
    }, 600);
  } catch (err) {
    console.warn('Notice: Wake chime playback skipped:', err);
  }
}

/**
 * Checks current browser microphone permission state.
 */
export async function checkMicrophonePermission(): Promise<
  'granted' | 'denied' | 'prompt' | 'unsupported'
> {
  if (
    typeof navigator === 'undefined' ||
    !navigator.permissions ||
    !navigator.permissions.query
  ) {
    return 'unsupported';
  }

  try {
    const status = await navigator.permissions.query({
      name: 'microphone' as PermissionName,
    });
    return status.state; // 'granted' | 'denied' | 'prompt'
  } catch {
    return 'unsupported';
  }
}

/**
 * Basic microphone verification:
 * Checks:
 * - navigator.mediaDevices
 * - getUserMedia()
 * - microphone permission
 * - audio stream
 */
export async function verifyMicrophoneAccess(): Promise<{
  ok: boolean;
  error?: string;
}> {
  if (
    typeof navigator === 'undefined' ||
    !navigator.mediaDevices ||
    !navigator.mediaDevices.getUserMedia
  ) {
    return {
      ok: false,
      error: 'Microphone access is not supported by your browser.',
    };
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const audioTracks = stream.getAudioTracks();
    if (!audioTracks || audioTracks.length === 0) {
      stream.getTracks().forEach((t) => t.stop());
      return {
        ok: false,
        error: 'No active microphone audio tracks detected on this device.',
      };
    }

    // Immediately stop tracks to free hardware audio for SpeechRecognition
    stream.getTracks().forEach((t) => t.stop());
    return { ok: true };
  } catch (err: unknown) {
    let msg = 'Microphone permission was denied or unavailable.';
    if (err instanceof DOMException) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        msg =
          'Microphone permission was denied. Please allow microphone permissions in your browser or address bar.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        msg = 'No microphone device was detected on your system.';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        msg = 'Your microphone is already in use by another application.';
      }
    }
    return { ok: false, error: msg };
  }
}

/**
 * Requests microphone permission explicitly from the user via getUserMedia.
 */
export async function requestMicrophoneAccess(): Promise<boolean> {
  const result = await verifyMicrophoneAccess();
  return result.ok;
}
