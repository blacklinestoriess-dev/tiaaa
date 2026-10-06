import type { LanguagePreference } from '../types';

// Web Speech API interface declarations for TypeScript
interface SpeechRecognitionResultItem {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  [index: number]: {
    readonly length: number;
    [index: number]: SpeechRecognitionResultItem;
    isFinal: boolean;
  };
}

interface ISpeechRecognitionEvent {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface ISpeechRecognitionErrorEvent {
  error: string;
  message?: string;
}

interface ISpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  lang: string;
  onstart: (() => void) | null;
  onresult: ((event: ISpeechRecognitionEvent) => void) | null;
  onerror: ((event: ISpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

interface ISpeechRecognitionConstructor {
  new (): ISpeechRecognitionInstance;
}

interface IWindowWithSpeech extends Window {
  SpeechRecognition?: ISpeechRecognitionConstructor;
  webkitSpeechRecognition?: ISpeechRecognitionConstructor;
}

export function isSpeechRecognitionSupported(): boolean {
  if (typeof window === 'undefined') return false;
  const win = window as unknown as IWindowWithSpeech;
  return Boolean(win.SpeechRecognition || win.webkitSpeechRecognition);
}

/**
 * Returns the best BCP-47 language tag for speech recognition based on user preference.
 * 'en-IN' is ideal for Indian English, Hinglish, and wake words in Latin script ('hello tia', 'what is gdp').
 * 'hi-IN' is used when Hindi is explicitly selected.
 */
export function getRecognitionLanguageCode(preference: LanguagePreference): string {
  switch (preference) {
    case 'hindi':
      return 'hi-IN';
    case 'english':
    case 'hinglish':
    case 'auto':
    default:
      return 'en-IN';
  }
}

export interface SpeechRecognitionController {
  start: () => Promise<void>;
  stop: () => void;
  abort: () => void;
  abortAsync: () => Promise<void>;
  isStarted: () => boolean;
  resetUtterance?: () => void;
}

export interface SpeechRecognitionOptions {
  continuous?: boolean;
  isWakeWordMode?: boolean;
  maxAlternatives?: number;
  lang?: string;
}

export interface NewSpeechResult {
  alternatives: string[];
  isFinal: boolean;
  resultIndex: number;
}

export interface SpeechRecognitionCallbacks {
  onStart?: () => void;
  onResult?: (transcript: string, isFinal: boolean) => void;
  onNewResult?: (newResult: NewSpeechResult) => void;
  onError?: (error: string, code?: string) => void;
  onEnd?: () => void;
}

// Module-level tracker to strictly enforce ONE active recognition session across the tab
let globalActiveController: SpeechRecognitionController | null = null;

/**
 * Merges an incoming speech transcript chunk with an existing accumulated transcript.
 * Solves mobile Chrome SpeechRecognition accumulation bugs where:
 * 1. Interim results or successive final events deliver cumulative superset strings
 *    (e.g., existing: "Patna ka", incoming: "Patna ka temperature")
 * 2. Duplicate final results are re-sent by mobile recognition engines
 * 3. Overlapping boundary words occur between recognition chunks
 *    (e.g., existing: "Patna ka", incoming: "ka temperature")
 * 4. Separate non-overlapping continuation chunks occur
 *    (e.g., existing: "Patna ka", incoming: "temperature")
 */
export function mergeTranscriptChunks(base: string, incoming: string): string {
  const b = (base || '').trim();
  const inc = (incoming || '').trim();

  if (!b) return inc;
  if (!inc) return b;

  const bLower = b.toLowerCase();
  const incLower = inc.toLowerCase();

  // 1. Exact identical match
  if (bLower === incLower) {
    return b;
  }

  // 2. Incoming is an expansion/superset starting with base (common on mobile Chrome)
  // E.g. base: "Patna ka", incoming: "Patna ka temperature" -> return "Patna ka temperature"
  if (incLower.startsWith(bLower)) {
    return inc;
  }

  // 3. Base already contains or ends with incoming (incoming is a stale/duplicate prefix or sub-phrase)
  // E.g. base: "Patna ka temperature", incoming: "Patna ka" -> return "Patna ka temperature"
  if (bLower.endsWith(incLower) || bLower.includes(incLower)) {
    return b;
  }

  // 4. Overlapping boundary words:
  // E.g. base: "Patna ka", incoming: "ka temperature"
  // Find the longest suffix of base words that matches the prefix of incoming words
  const bWords = b.split(/\s+/);
  const incWords = inc.split(/\s+/);

  const maxOverlap = Math.min(bWords.length, incWords.length);
  let overlapLength = 0;

  for (let len = maxOverlap; len > 0; len--) {
    const bSuffix = bWords.slice(-len).map((w) => w.toLowerCase()).join(' ');
    const incPrefix = incWords.slice(0, len).map((w) => w.toLowerCase()).join(' ');
    if (bSuffix === incPrefix) {
      overlapLength = len;
      break;
    }
  }

  if (overlapLength > 0) {
    const remainingIncoming = incWords.slice(overlapLength).join(' ');
    return remainingIncoming ? `${b} ${remainingIncoming}` : b;
  }

  // 5. Completely separate non-overlapping continuation chunk
  return `${b} ${inc}`;
}

export function createSpeechRecognizer(
  langPref: LanguagePreference,
  callbacks: SpeechRecognitionCallbacks,
  options: SpeechRecognitionOptions = {}
): SpeechRecognitionController | null {
  if (!isSpeechRecognitionSupported()) {
    callbacks.onError?.(
      'Speech recognition is not supported in this browser. Please use Chrome or a Chromium browser.',
      'not-supported'
    );
    return null;
  }

  const win = window as unknown as IWindowWithSpeech;
  const SpeechConstructor = win.SpeechRecognition || win.webkitSpeechRecognition;
  if (!SpeechConstructor) return null;

  try {
    const recognition = new SpeechConstructor();
    recognition.continuous = options.continuous ?? false;
    recognition.interimResults = true;
    // Inspect multiple alternatives in wake-word mode to catch phonetic variations like "tea", "tiya", "पिया"
    recognition.maxAlternatives = options.maxAlternatives ?? (options.isWakeWordMode ? 5 : 1);
    recognition.lang = options.lang || getRecognitionLanguageCode(langPref);

    let isRunning = false;
    let isAborting = false;
    let lastEmittedTranscript = '';
    // Track finalized text by result index to handle mobile Chrome index updates and prevent duplicate accumulation
    const finalizedChunksByIndex = new Map<number, string>();

    const resetSessionTranscript = () => {
      finalizedChunksByIndex.clear();
      lastEmittedTranscript = '';
    };

    recognition.onstart = () => {
      isRunning = true;
      isAborting = false;
      resetSessionTranscript();
      callbacks.onStart?.();
    };

    recognition.onresult = (event: ISpeechRecognitionEvent) => {
      if (isAborting) return;

      // 1. Inspect each NEW SpeechRecognition result independently with all recognition alternatives (for wake-word)
      if (callbacks.onNewResult) {
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const res = event.results[i];
          if (!res) continue;
          const alts: string[] = [];
          for (let a = 0; a < res.length; ++a) {
            if (res[a] && typeof res[a].transcript === 'string') {
              const text = res[a].transcript.trim();
              if (text) {
                alts.push(text);
              }
            }
          }
          if (alts.length > 0) {
            callbacks.onNewResult({
              alternatives: alts,
              isFinal: Boolean(res.isFinal),
              resultIndex: i,
            });
          }
        }
      }

      // 2. Transcript calculation for question listeners:
      // Strictly separates final chunks from interim hypothesis and prevents duplicate concatenations.
      if (callbacks.onResult) {
        let hasNewFinal = false;

        // Process newly finalized result indices from event.resultIndex onwards
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const item = event.results[i];
          if (item && item.isFinal && item[0]) {
            const text = (item[0].transcript || '').trim();
            if (text) {
              const previousForThisIndex = finalizedChunksByIndex.get(i);
              if (previousForThisIndex !== text) {
                finalizedChunksByIndex.set(i, text);
                hasNewFinal = true;
              }
            }
          }
        }

        // Build consolidated finalized transcript across all sorted indices
        const sortedIndices = Array.from(finalizedChunksByIndex.keys()).sort((a, b) => a - b);
        let consolidatedFinal = '';
        for (const idx of sortedIndices) {
          const chunk = finalizedChunksByIndex.get(idx);
          if (chunk) {
            consolidatedFinal = mergeTranscriptChunks(consolidatedFinal, chunk);
          }
        }

        // Process current interim hypothesis (strictly non-final items) from event.resultIndex onwards
        let currentInterim = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const item = event.results[i];
          if (item && !item.isFinal && item[0]) {
            const text = (item[0].transcript || '').trim();
            if (text) {
              currentInterim = mergeTranscriptChunks(currentInterim, text);
            }
          }
        }

        // Combine consolidated finalized transcript with the active interim hypothesis
        const currentUtterance = (currentInterim
          ? mergeTranscriptChunks(consolidatedFinal, currentInterim)
          : consolidatedFinal
        ).trim();

        if (currentUtterance && currentUtterance !== lastEmittedTranscript) {
          lastEmittedTranscript = currentUtterance;
          callbacks.onResult(currentUtterance, hasNewFinal);
        }
      }
    };

    recognition.onerror = (event: ISpeechRecognitionErrorEvent) => {
      if (isAborting) return;

      // In wake-word passive standby mode, 'no-speech' or 'aborted' is expected when user pauses
      if (options.isWakeWordMode && (event.error === 'no-speech' || event.error === 'aborted')) {
        callbacks.onError?.('no-speech', event.error);
        return;
      }

      let friendlyMessage = 'Microphone or speech recognition error.';
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        friendlyMessage =
          'Microphone access was denied. Please allow microphone permissions in your browser or address bar.';
      } else if (event.error === 'no-speech') {
        friendlyMessage = "I didn't hear anything. Tap the mic and speak again!";
      } else if (event.error === 'network') {
        friendlyMessage = 'Speech recognition network error. Please check your internet connection.';
      } else if (event.error === 'audio-capture') {
        friendlyMessage = 'No microphone was detected on your device.';
      } else if (event.error === 'aborted') {
        friendlyMessage = 'Speech recognition was stopped.';
      }

      callbacks.onError?.(friendlyMessage, event.error);
    };

    recognition.onend = () => {
      isRunning = false;
      isAborting = false;
      callbacks.onEnd?.();
    };

    const controller: SpeechRecognitionController = {
      start: async () => {
        if (isRunning) return;

        // Cleanly terminate any other active recognition session first
        if (globalActiveController && globalActiveController !== controller) {
          try {
            await globalActiveController.abortAsync();
          } catch {
            // ignore
          }
        }
        globalActiveController = controller;
        resetSessionTranscript();

        const attemptStart = (retriesLeft = 2) => {
          try {
            recognition.start();
          } catch (err: unknown) {
            const isInvalidState =
              err instanceof Error && err.name === 'InvalidStateError';
            if (isInvalidState && retriesLeft > 0) {
              setTimeout(() => {
                if (!isRunning) attemptStart(retriesLeft - 1);
              }, 120);
            } else {
              console.debug('Recognition start notice:', err);
            }
          }
        };
        attemptStart();
      },
      stop: () => {
        try {
          isRunning = false;
          resetSessionTranscript();
          if (globalActiveController === controller) {
            globalActiveController = null;
          }
          recognition.stop();
        } catch {
          // ignore
        }
      },
      abort: () => {
        try {
          isRunning = false;
          isAborting = true;
          resetSessionTranscript();
          if (globalActiveController === controller) {
            globalActiveController = null;
          }
          // Detach listeners immediately to prevent delayed/zombie events
          recognition.onresult = null;
          recognition.onerror = null;
          recognition.onend = null;
          recognition.abort();
        } catch {
          // ignore
        }
      },
      abortAsync: () => {
        return new Promise<void>((resolve) => {
          resetSessionTranscript();
          if (globalActiveController === controller) {
            globalActiveController = null;
          }
          if (!isRunning) {
            resolve();
            return;
          }
          isAborting = true;
          // Detach onresult immediately so results cannot leak while waiting to abort
          recognition.onresult = null;
          recognition.onerror = null;

          let resolved = false;
          const finish = () => {
            if (!resolved) {
              resolved = true;
              recognition.onend = null;
              resolve();
            }
          };
          const safetyTimer = setTimeout(finish, 150);
          recognition.onend = () => {
            clearTimeout(safetyTimer);
            isRunning = false;
            isAborting = false;
            finish();
          };
          try {
            isRunning = false;
            recognition.abort();
          } catch {
            clearTimeout(safetyTimer);
            finish();
          }
        });
      },
      isStarted: () => isRunning,
      resetUtterance: () => {
        resetSessionTranscript();
      },
    };

    return controller;
  } catch (err) {
    console.error('Failed to create SpeechRecognition instance:', err);
    callbacks.onError?.('Could not initialize speech recognition.', 'init-error');
    return null;
  }
}
