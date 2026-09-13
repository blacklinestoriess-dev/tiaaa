/**
 * Wake Word and Audio Cue services for Tia Assistant.
 * Provides on-device "Hey Tia" / "Tia" wake phrase spotting, natural audio chimes,
 * and browser microphone verification and permission management.
 */

export interface WakeWordMatch {
  detected: boolean;
  remainderQuery: string;
  matchedPhrase?: string;
}

/**
 * Controlled transcript normalization:
 * - lowercase
 * - remove punctuation
 * - normalize spaces
 */
export function normalizeTranscript(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"'’“”]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Detects whether a speech transcript is an acoustic echo or repetition of Tia's recent response.
 * Prevents microphone feedback loops where Tia's own voice through speakers is captured as user input.
 */
export function isTiaVoiceEcho(
  candidateTranscript: string,
  lastTiaSpokenText: string
): boolean {
  if (!candidateTranscript || !lastTiaSpokenText) return false;

  const candNorm = normalizeTranscript(candidateTranscript);
  const tiaNorm = normalizeTranscript(lastTiaSpokenText);

  if (!candNorm || !tiaNorm) return false;

  // Short casual conversational affirmations from real users (e.g. "ok", "haan", "nahi", "why")
  // should never be falsely rejected
  if (candNorm.length < 5) return false;

  // 1. Direct exact or substring match:
  // If candidate is a substring of Tia's answer (and has at least 8 chars or 2 words)
  if (tiaNorm.includes(candNorm) && (candNorm.length >= 8 || candNorm.split(' ').length >= 2)) {
    return true;
  }

  // 2. Tia's answer is inside candidate transcript
  if (candNorm.includes(tiaNorm)) {
    return true;
  }

  // 3. High word overlap test for partial captures (e.g. speaker tail captured on mic)
  const candWords = candNorm.split(' ').filter((w) => w.length > 2);
  const tiaWords = new Set(tiaNorm.split(' ').filter((w) => w.length > 2));

  if (candWords.length >= 3 && tiaWords.size > 0) {
    let matchingCount = 0;
    for (const word of candWords) {
      if (tiaWords.has(word)) {
        matchingCount++;
      }
    }
    const ratio = matchingCount / candWords.length;
    // If more than 60% of words in candidate transcript match words from Tia's last spoken answer
    if (ratio >= 0.6) {
      return true;
    }
  }

  return false;
}

/**
 * Checks if a transcript begins with the "Tia" or "Hey Tia" wake phrase.
 * 
 * Supported wake phrases:
 * - "Tia"
 * - "Hey Tia"
 * - "Hey, Tia"
 * - "Tiya"
 * - "Hey Tiya"
 * - "Hi Tia", "Hello Tia", "Suno Tia"
 * - Devanagari: "टिया", "टीया", "हे टिया", "सुनो टिया"
 * 
 * STRICT NEGATIVE CONSTRAINTS:
 * - "Dia" must NOT wake Tia.
 * - "Dea" must NOT wake Tia.
 * - "Diya" must NOT wake Tia.
 * - "Tea" must NOT wake Tia.
 * - Random similar words must NOT wake Tia.
 */
export function detectWakeWord(rawTranscript: string): WakeWordMatch {
  if (!rawTranscript) return { detected: false, remainderQuery: '' };
  const raw = rawTranscript.trim();
  if (!raw) return { detected: false, remainderQuery: '' };

  const normalized = normalizeTranscript(raw);
  if (!normalized) return { detected: false, remainderQuery: '' };

  const tokens = normalized.split(' ');
  if (tokens.length === 0) return { detected: false, remainderQuery: '' };

  const isTiaToken = (t: string): boolean =>
    t === 'tia' || t === 'tiya' || t === 'टिया' || t === 'टीया';

  const isGreetingPrefix = (t: string): boolean =>
    t === 'hey' ||
    t === 'hi' ||
    t === 'hello' ||
    t === 'suno' ||
    t === 'ok' ||
    t === 'okay' ||
    t === 'हे' ||
    t === 'सुनो';

  let matchedWordCount = 0;
  let matchedPhrase = '';

  // 1. Standalone "Tia" / "Tiya"
  if (isTiaToken(tokens[0])) {
    matchedWordCount = 1;
    matchedPhrase = tokens[0];
  }
  // 2. "Hey Tia" / "Hey Tiya" / "Hi Tia" / "Hello Tia" / "Suno Tia"
  else if (isGreetingPrefix(tokens[0]) && tokens.length > 1 && isTiaToken(tokens[1])) {
    matchedWordCount = 2;
    matchedPhrase = `${tokens[0]} ${tokens[1]}`;
  }

  if (matchedWordCount > 0) {
    // Extract remainder from raw input to preserve casing and full query
    let remainder = '';
    const normLower = raw.toLowerCase();
    const phraseIdx = normLower.indexOf(matchedPhrase.toLowerCase());
    if (phraseIdx !== -1) {
      const rawAfter = raw.slice(phraseIdx + matchedPhrase.length);
      remainder = rawAfter
        .replace(/^[\s,.:;!?\'"’\-—]+/, '')
        .replace(/^(?:suno|sun|suniye|ji|bolo|batao|bataiye|listen|सुनो|सुनिए|जी|बोलो|बताओ|बताइए)[\s,.:;!?\'"’\-—]*/i, '')
        .replace(/^[\s,.:;!?\'"’\-—]+/, '')
        .trim();
    } else {
      remainder = tokens.slice(matchedWordCount).join(' ').trim();
    }

    return {
      detected: true,
      remainderQuery: remainder,
      matchedPhrase: matchedPhrase === 'टिया' ? 'टिया' : 'Tia',
    };
  }

  return { detected: false, remainderQuery: '' };
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
