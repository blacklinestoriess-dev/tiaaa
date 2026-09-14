import { useState, useEffect, useRef, useCallback } from 'react';
import type {
  AssistantState,
  Message,
  TiaSettings,
  SpeechVoiceOption,
  TiaEmotion,
  OwnerProfile,
  AuthSession,
  UserProfile,
} from './types';
import { Header } from './components/Header';
import { VoiceOrb } from './components/VoiceOrb';
import { VoiceControls } from './components/VoiceControls';
import { ConversationPreview } from './components/ConversationPreview';
import { SettingsModal } from './components/SettingsModal';
import { ErrorMessage } from './components/ErrorMessage';
import { AuthScreen } from './components/AuthScreen';
import {
  WakeWordDebugIndicator,
  type WakeWordDebugInfo,
} from './components/WakeWordDebugIndicator';
import {
  createSpeechRecognizer,
  isSpeechRecognitionSupported,
  type SpeechRecognitionController,
} from './services/speechRecognition';
import {
  getAvailableVoices,
  selectContextualVoice,
  speakEmotionally,
  type SpeechSessionController,
} from './services/speechSynthesis';
import {
  detectWakeWord,
  playWakeChime,
  checkMicrophonePermission,
  requestMicrophoneAccess,
  verifyMicrophoneAccess,
  isTiaVoiceEcho,
  isStaleOrEchoTranscript,
} from './services/wakeWord';
import { parseApiResponse } from './utils/api';

const DEFAULT_SETTINGS: TiaSettings = {
  voiceEnabled: true,
  autoVoiceSelection: true,
  speechRate: 1.0,
  languagePreference: 'auto',
  funnyMode: true,
  theme: 'dark',
  selectedVoiceURI: '',
  handsFreeMode: true,
  followUpTimeoutSeconds: 4,
  wakeChimeEnabled: true,
};

export default function App() {
  // Application State
  const [settings, setSettings] = useState<TiaSettings>(() => {
    try {
      const stored = localStorage.getItem('tia_settings');
      if (stored) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
      }
    } catch {
      // ignore
    }
    return DEFAULT_SETTINGS;
  });

  const [assistantState, setAssistantState] = useState<AssistantState>('idle');
  const [messages, setMessages] = useState<Message[]>([]);
  const [lastUserQuery, setLastUserQuery] = useState<string | null>(null);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [availableVoices, setAvailableVoices] = useState<SpeechVoiceOption[]>([]);
  const [currentEmotion, setCurrentEmotion] = useState<TiaEmotion>('neutral');
  const [currentVoiceName, setCurrentVoiceName] = useState<string>('');
  const [micPermission, setMicPermission] = useState<
    'granted' | 'denied' | 'prompt' | 'unsupported'
  >('prompt');
  const [followUpRemaining, setFollowUpRemaining] = useState<number>(4);

  // User Authentication & Private Session
  const [authSession, setAuthSession] = useState<AuthSession | null>(() => {
    try {
      const cached = localStorage.getItem('tia_auth_session');
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });

  const [userProfile, setUserProfile] = useState<UserProfile | null>(() => {
    try {
      const cached = localStorage.getItem('tia_user_profile');
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });

  // Persistent Owner Profile State (for Tia personality compatibility & memory)
  const [ownerProfile, setOwnerProfile] = useState<OwnerProfile | null>(() => {
    try {
      const cached = localStorage.getItem('tia_owner_profile');
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });

  // Check auth session validity on mount & load user profile
  useEffect(() => {
    const token = authSession?.token || localStorage.getItem('tia_auth_token');
    if (!token) return;

    fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => parseApiResponse(res, '/api/auth/me'))
      .then((data) => {
        if (data?.user && data?.profile) {
          setUserProfile(data.profile);
          localStorage.setItem('tia_user_profile', JSON.stringify(data.profile));

          const mappedOwner: OwnerProfile = {
            name: data.profile.full_name || 'Owner',
            relationship: 'owner',
            location: data.profile.location || data.profile.address || '',
            occupation_status: data.profile.current_work || data.profile.occupation_status || 'Explorer',
            personality_traits: ['intelligent', 'curious', 'ambitious'],
            additional_memories: (data.memories || []).map((m: any) => ({
              id: m.id,
              fact: m.fact || m.memory_value || '',
              category: m.category || m.memory_type || 'personal',
              createdAt: m.created_at || new Date().toISOString(),
            })),
            last_updated: new Date().toISOString(),
          };
          setOwnerProfile(mappedOwner);
          localStorage.setItem('tia_owner_profile', JSON.stringify(mappedOwner));
        }
      })
      .catch((err) => {
        console.warn('Session expired or invalid:', err);
        localStorage.removeItem('tia_auth_session');
        localStorage.removeItem('tia_auth_token');
        localStorage.removeItem('tia_user_profile');
        setAuthSession(null);
        setUserProfile(null);
      });
  }, [authSession?.token]);

  // Load authenticated user conversation history
  useEffect(() => {
    const token = authSession?.token;
    if (!token) return;

    fetch('/api/conversations', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => parseApiResponse(res, '/api/conversations'))
      .then((data) => {
        const loadedMsgs: Message[] = [];
        if (data?.messages && Array.isArray(data.messages) && data.messages.length > 0) {
          data.messages.forEach((m: any) => {
            loadedMsgs.push({
              id: m.id || `msg-${Date.now()}-${Math.random()}`,
              role: m.role,
              content: m.content,
              timestamp: m.timestamp || Date.now(),
              emotion: m.emotion,
              voiceName: m.voiceName,
              detectedLanguage: m.detectedLanguage,
            });
          });
        } else if (data?.conversations && Array.isArray(data.conversations) && data.conversations.length > 0) {
          data.conversations.forEach((conv: any) => {
            if (conv.messages && Array.isArray(conv.messages)) {
              conv.messages.forEach((m: any) => {
                loadedMsgs.push({
                  id: m.id || `msg-${Date.now()}-${Math.random()}`,
                  role: m.role,
                  content: m.content,
                  timestamp: m.timestamp || Date.now(),
                  emotion: m.emotion,
                  voiceName: m.voiceName,
                  detectedLanguage: m.detectedLanguage,
                });
              });
            }
          });
        }
        if (loadedMsgs.length > 0) {
          setMessages(loadedMsgs);
        }
      })
      .catch((err) => console.warn('Could not load user conversations:', err));
  }, [authSession?.token]);

  // Wake-word diagnostic debug state
  const [debugInfo, setDebugInfo] = useState<WakeWordDebugInfo>({
    wakeWordActive: false,
    micPermission: 'prompt',
    micReady: false,
    speechRecReady: isSpeechRecognitionSupported(),
    isListening: false,
    recognizerStatus: 'Standby',
    lastRecognizedSpeech: '',
    lastRecognizedTimestamp: '',
    lastWakeDetected: null,
    activeLangCode: 'en-IN',
  });

  // Speech & Timer Controllers References
  const recognizerRef = useRef<SpeechRecognitionController | null>(null);
  const recognitionModeRef = useRef<'idle_wake' | 'active' | 'follow_up'>('idle_wake');
  const transcriptBufferRef = useRef<string>('');
  const speechSessionRef = useRef<SpeechSessionController | null>(null);
  const followUpTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const followUpTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const followUpEndTimeRef = useRef<number | null>(null);
  const followUpRestartAttemptsRef = useRef<number>(0);
  const wakeRestartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wakeTransitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speechSilenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const questionWaitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioSettleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSubmittingRef = useRef<boolean>(false);
  const isSpeakingRef = useRef<boolean>(false);
  const activeSessionIdRef = useRef<number>(0);
  const lastTiaSpokenTextRef = useRef<string>('');
  const lastTiaSpeechEndTimeRef = useRef<number>(0);
  const lastSubmittedQuestionRef = useRef<string>('');
  const isComponentMounted = useRef(true);

  // Sync ref for state in callbacks
  const stateRef = useRef(assistantState);
  useEffect(() => {
    stateRef.current = assistantState;
  }, [assistantState]);

  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  // Check microphone permissions and speech recognition support on mount
  useEffect(() => {
    isComponentMounted.current = true;
    const speechSupported = isSpeechRecognitionSupported();

    checkMicrophonePermission().then((status) => {
      if (isComponentMounted.current) {
        setMicPermission(status);
        const micIsReady = status === 'granted';
        setDebugInfo((prev) => ({
          ...prev,
          micPermission: status,
          micReady: micIsReady,
          speechRecReady: speechSupported,
        }));
      }
    });

    return () => {
      isComponentMounted.current = false;
    };
  }, []);

  // Persist settings
  useEffect(() => {
    try {
      localStorage.setItem('tia_settings', JSON.stringify(settings));
    } catch {
      // ignore
    }
  }, [settings]);

  // Sync theme class to document body
  useEffect(() => {
    if (settings.theme === 'light') {
      document.documentElement.classList.remove('dark');
      document.body.className = authSession
        ? 'bg-slate-100 text-slate-900 antialiased overflow-hidden select-none'
        : 'bg-slate-100 text-slate-900 antialiased min-h-screen overflow-y-auto';
    } else {
      document.documentElement.classList.add('dark');
      document.body.className = authSession
        ? 'bg-[#0b0f19] text-slate-100 antialiased overflow-hidden select-none'
        : 'bg-[#0b0f19] text-slate-100 antialiased min-h-screen overflow-y-auto';
    }
  }, [settings.theme, !!authSession]);

  // Load voices on mount and on voiceschanged
  useEffect(() => {
    const updateVoices = () => {
      const voices = getAvailableVoices();
      setAvailableVoices(voices);
    };

    updateVoices();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = updateVoices;
    }

    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, []);

  // Clear follow-up countdown interval & timeout
  const clearFollowUpTimer = useCallback(() => {
    if (followUpTimerRef.current) {
      clearInterval(followUpTimerRef.current);
      followUpTimerRef.current = null;
    }
    if (followUpTimeoutRef.current) {
      clearTimeout(followUpTimeoutRef.current);
      followUpTimeoutRef.current = null;
    }
    followUpEndTimeRef.current = null;
    followUpRestartAttemptsRef.current = 0;
  }, []);

  // Clear question wait timer
  const clearQuestionWaitTimer = useCallback(() => {
    if (questionWaitTimerRef.current) {
      clearTimeout(questionWaitTimerRef.current);
      questionWaitTimerRef.current = null;
    }
  }, []);

  // Clear speech silence debounce timer
  const clearSpeechSilenceTimer = useCallback(() => {
    if (speechSilenceTimerRef.current) {
      clearTimeout(speechSilenceTimerRef.current);
      speechSilenceTimerRef.current = null;
    }
  }, []);

  // Stop any active speech synthesis (with support for barge-in)
  const stopSpeech = useCallback(() => {
    isSpeakingRef.current = false;
    if (audioSettleTimerRef.current) {
      clearTimeout(audioSettleTimerRef.current);
      audioSettleTimerRef.current = null;
    }
    if (speechSessionRef.current) {
      speechSessionRef.current.cancel();
      speechSessionRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (assistantState === 'speaking') {
      setAssistantState('idle');
    }
  }, [assistantState]);

  // Forward declarations for mutual references
  const startListeningRef = useRef<(isFollowUp?: boolean) => void>(() => {});
  const startWakeWordListenerRef = useRef<() => void>(() => {});
  const submitToTiaRef = useRef<(query: string) => Promise<void>>(async () => {});

  // Speak response out loud, with hands-free follow-up listening chained at the end
  const speakResponse = useCallback(
    (
      textToSpeak: string,
      emotion: TiaEmotion = 'neutral',
      detectedLanguage: 'hindi' | 'hinglish' | 'english' = 'hinglish',
      contextType?: any,
      suggestedVoiceGender?: 'female' | 'male' | 'any'
    ) => {
      // Record Tia's spoken text for acoustic echo cancellation
      lastTiaSpokenTextRef.current = textToSpeak;

      if (!settings.voiceEnabled) {
        if (settings.handsFreeMode) {
          startListeningRef.current(true);
        } else {
          setAssistantState('idle');
        }
        return;
      }

      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        setAssistantState('idle');
        return;
      }

      // 1. Stop any prior speech session
      if (speechSessionRef.current) {
        speechSessionRef.current.cancel();
        speechSessionRef.current = null;
      }

      // 2. CRITICAL: TTS and SpeechRecognition must NEVER run against each other.
      // Invalidate session so late callbacks are ignored, and abort active recognizer.
      activeSessionIdRef.current += 1;
      if (recognizerRef.current) {
        try {
          recognizerRef.current.abort();
        } catch {
          // ignore
        }
        recognizerRef.current = null;
      }
      transcriptBufferRef.current = '';
      setLiveTranscript('');
      clearFollowUpTimer();
      clearQuestionWaitTimer();
      clearSpeechSilenceTimer();

      isSpeakingRef.current = true;

      // Contextual voice resolution
      const { voice, voiceLabel } = selectContextualVoice({
        emotion,
        detectedLanguage,
        contextType,
        preferredGender: suggestedVoiceGender,
        userPreferenceURI: settings.autoVoiceSelection
          ? undefined
          : settings.selectedVoiceURI,
      });

      setCurrentEmotion(emotion);
      setCurrentVoiceName(voiceLabel);

      speechSessionRef.current = speakEmotionally({
        text: textToSpeak,
        emotion,
        voice,
        baseRate: settings.speechRate,
        onStart: () => {
          isSpeakingRef.current = true;
          setAssistantState('speaking');
          setDebugInfo((prev) => ({
            ...prev,
            wakeWordActive: false,
            recognizerStatus: 'SPEAKING',
          }));
        },
        onEnd: () => {
          speechSessionRef.current = null;
          isSpeakingRef.current = false;
          lastTiaSpeechEndTimeRef.current = Date.now();

          // Wait a short safe audio-settle delay (450ms) so speaker acoustic playback decays completely
          // before opening the microphone for follow-up listening
          if (settingsRef.current.handsFreeMode && isSpeechRecognitionSupported()) {
            if (audioSettleTimerRef.current) {
              clearTimeout(audioSettleTimerRef.current);
            }
            audioSettleTimerRef.current = setTimeout(() => {
              audioSettleTimerRef.current = null;
              if (
                !isComponentMounted.current ||
                isSpeakingRef.current ||
                isSubmittingRef.current
              ) {
                return;
              }
              if (stateRef.current === 'speaking' || stateRef.current === 'idle') {
                startListeningRef.current(true);
              }
            }, 450);
          } else {
            setAssistantState('idle');
          }
        },
        onError: (err) => {
          console.warn('Speech playback notice:', err);
          speechSessionRef.current = null;
          isSpeakingRef.current = false;
          setAssistantState('idle');
        },
      });
    },
    [
      settings.voiceEnabled,
      settings.handsFreeMode,
      settings.autoVoiceSelection,
      settings.selectedVoiceURI,
      settings.speechRate,
      clearFollowUpTimer,
      clearQuestionWaitTimer,
      clearSpeechSilenceTimer,
    ]
  );

  // Submit query to Tia AI
  const submitToTia = useCallback(
    async (userText: string) => {
      const trimmed = userText.trim();
      if (!trimmed) return;

      // Stale event & double-submission prevention
      activeSessionIdRef.current += 1;
      isSubmittingRef.current = true;
      lastSubmittedQuestionRef.current = trimmed;

      clearFollowUpTimer();
      clearQuestionWaitTimer();
      clearSpeechSilenceTimer();
      stopSpeech();

      // Cleanly stop any existing recognizer
      if (recognizerRef.current) {
        try {
          recognizerRef.current.abort();
        } catch {
          // ignore
        }
        recognizerRef.current = null;
      }
      transcriptBufferRef.current = '';
      setLiveTranscript('');

      setErrorMessage(null);
      setLastUserQuery(trimmed);
      setAssistantState('thinking');
      setDebugInfo((prev) => ({
        ...prev,
        wakeWordActive: false,
        recognizerStatus: 'PROCESSING',
      }));

      // User message
      const userMsg: Message = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: trimmed,
        timestamp: Date.now(),
      };

      const updatedHistory = [...messages, userMsg];
      setMessages(updatedHistory);

      try {
        const token = authSession?.token || localStorage.getItem('tia_auth_token');
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            message: trimmed,
            history: messages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
            funnyMode: settings.funnyMode,
            preferredLanguage: settings.languagePreference,
          }),
        });

        const data = await parseApiResponse(response, '/api/chat');

        // Update persistent owner profile if Tia remembered or updated anything
        if (data.ownerProfile) {
          setOwnerProfile(data.ownerProfile);
          try {
            localStorage.setItem('tia_owner_profile', JSON.stringify(data.ownerProfile));
          } catch {
            // ignore
          }
        }

        const replyContent =
          data.reply ||
          "Arre, main abhi sun nahi paayi. Kya tum dobara pooch sakte ho?";
        const replyEmotion: TiaEmotion = data.emotion || 'neutral';
        const detectedLang = data.detectedLanguage || 'hinglish';
        const contextType = data.contextType || 'chat';
        const suggestedGender = data.suggestedVoiceGender || 'female';

        // Pre-resolve voice name to label on message card
        const { voiceLabel } = selectContextualVoice({
          emotion: replyEmotion,
          detectedLanguage: detectedLang,
          contextType,
          preferredGender: suggestedGender,
          userPreferenceURI: settings.autoVoiceSelection
            ? undefined
            : settings.selectedVoiceURI,
        });

        const tiaMsg: Message = {
          id: `tia-${Date.now()}`,
          role: 'assistant',
          content: replyContent,
          timestamp: Date.now(),
          model: data.model,
          emotion: replyEmotion,
          voiceName: voiceLabel,
          detectedLanguage: detectedLang,
        };

        setMessages((prev) => [...prev, tiaMsg]);

        // Speak Tia's answer out loud with natural prosody and chosen voice
        speakResponse(
          replyContent,
          replyEmotion,
          detectedLang,
          contextType,
          suggestedGender
        );
      } catch (err: unknown) {
        console.error('Error contacting Tia backend:', err);
        const errStr =
          err instanceof Error
            ? err.message
            : 'Error connecting to Tia. Please check connection.';
        setErrorMessage(errStr);
        setAssistantState('idle');
      } finally {
        isSubmittingRef.current = false;
      }
    },
    [
      messages,
      settings.funnyMode,
      settings.languagePreference,
      settings.autoVoiceSelection,
      settings.selectedVoiceURI,
      speakResponse,
      stopSpeech,
      clearFollowUpTimer,
    ]
  );
  submitToTiaRef.current = submitToTia;

  // Stop speech recognition
  const stopListening = useCallback(() => {
    clearFollowUpTimer();
    clearQuestionWaitTimer();
    clearSpeechSilenceTimer();

    // Invalidate session so late callbacks are discarded
    activeSessionIdRef.current += 1;

    if (recognizerRef.current) {
      try {
        recognizerRef.current.abort();
      } catch {
        // ignore
      }
      recognizerRef.current = null;
    }

    const finalQuery = transcriptBufferRef.current.trim();
    transcriptBufferRef.current = '';
    setLiveTranscript('');

    if (
      finalQuery &&
      !isSubmittingRef.current &&
      !isStaleOrEchoTranscript(
        finalQuery,
        lastTiaSpokenTextRef.current,
        lastSubmittedQuestionRef.current
      )
    ) {
      submitToTia(finalQuery);
    } else {
      isSubmittingRef.current = false;
      setAssistantState('idle');
      setDebugInfo((prev) => ({
        ...prev,
        recognizerStatus: 'IDLE (Stopped manually)',
      }));
      if (settingsRef.current.handsFreeMode) {
        setTimeout(() => {
          if (stateRef.current === 'idle') {
            startWakeWordListenerRef.current();
          }
        }, 250);
      }
    }
  }, [submitToTia, clearFollowUpTimer, clearQuestionWaitTimer, clearSpeechSilenceTimer]);

  // Clean transition from wake word detection to active question listening
  const transitionToQuestionListening = useCallback(async () => {
    activeSessionIdRef.current += 1;
    // Cleanly stop and await wake recognizer shutdown so mic is completely released
    if (recognizerRef.current) {
      const oldRecognizer = recognizerRef.current;
      recognizerRef.current = null;
      try {
        await oldRecognizer.abortAsync();
      } catch {
        // ignore
      }
    }

    // Short pause for microphone audio stream handover
    await new Promise((resolve) => setTimeout(resolve, 150));

    if (!isComponentMounted.current) return;

    // Launch active question listening session
    startListeningRef.current(false);
  }, []);

  // Start active speech recognition (used either from wake word, user tap, or follow-up listening)
  const startListening = useCallback(
    async (isFollowUp = false, isRestart = false) => {
      // Invalidate any previous session so old callbacks are strictly dropped
      const sessionId = ++activeSessionIdRef.current;

      // Reset state and ALWAYS clear transcript buffer when beginning new recognition session
      if (!isRestart) {
        clearFollowUpTimer();
        clearQuestionWaitTimer();
        clearSpeechSilenceTimer();
        transcriptBufferRef.current = '';
        setLiveTranscript('');
      } else {
        clearSpeechSilenceTimer();
      }
      stopSpeech();
      setErrorMessage(null);
      isSubmittingRef.current = false;

      // Speech Recognition engine check
      if (!isSpeechRecognitionSupported()) {
        setErrorMessage(
          'Speech recognition is not supported in this browser. Please open in Google Chrome on Android or desktop!'
        );
        setAssistantState('idle');
        setDebugInfo((prev) => ({
          ...prev,
          speechRecReady: false,
          isListening: false,
          recognizerStatus: 'ERROR: Speech recognition not supported',
        }));
        return;
      }

      // Stop any prior recognizer cleanly
      if (recognizerRef.current) {
        try {
          await recognizerRef.current.abortAsync();
        } catch {
          // ignore
        }
        recognizerRef.current = null;
      }

      if (sessionId !== activeSessionIdRef.current || !isComponentMounted.current) {
        return;
      }

      recognitionModeRef.current = isFollowUp ? 'follow_up' : 'active';
      setAssistantState(isFollowUp ? 'follow_up_listening' : 'listening');
      setDebugInfo((prev) => ({
        ...prev,
        micReady: true,
        speechRecReady: true,
        isListening: true,
        wakeWordActive: false,
        recognizerStatus: isFollowUp
          ? 'FOLLOW_UP_LISTENING'
          : 'QUESTION_LISTENING',
      }));

      // Setup follow-up timer (EXACTLY 5 SECONDS)
      if (isFollowUp) {
        if (!followUpEndTimeRef.current || !isRestart) {
          const timeoutSeconds = 5;
          const endTime = Date.now() + timeoutSeconds * 1000;
          followUpEndTimeRef.current = endTime;
          followUpRestartAttemptsRef.current = 0;
          setFollowUpRemaining(timeoutSeconds);

          if (followUpTimerRef.current) {
            clearInterval(followUpTimerRef.current);
          }
          if (followUpTimeoutRef.current) {
            clearTimeout(followUpTimeoutRef.current);
          }

          followUpTimerRef.current = setInterval(() => {
            if (!followUpEndTimeRef.current) {
              clearFollowUpTimer();
              return;
            }

            const msRemaining = followUpEndTimeRef.current - Date.now();
            const secsLeft = Math.max(0, Math.ceil(msRemaining / 1000));
            setFollowUpRemaining(secsLeft);
          }, 200);

          // One-shot exact 5-second silence timeout: returns to idle
          followUpTimeoutRef.current = setTimeout(() => {
            clearFollowUpTimer();
            if (sessionId !== activeSessionIdRef.current) return;
            if (
              stateRef.current === 'follow_up_listening' &&
              !isSubmittingRef.current
            ) {
              activeSessionIdRef.current += 1;
              if (recognizerRef.current) {
                try {
                  recognizerRef.current.abort();
                } catch {
                  // ignore
                }
                recognizerRef.current = null;
              }
              transcriptBufferRef.current = '';
              setLiveTranscript('');
              setAssistantState('idle');
              setDebugInfo((prev) => ({
                ...prev,
                isListening: false,
                recognizerStatus: 'IDLE (Follow-up 5s expired naturally)',
              }));
              if (settingsRef.current.handsFreeMode) {
                setTimeout(() => {
                  if (stateRef.current === 'idle') {
                    startWakeWordListenerRef.current();
                  }
                }, 250);
              }
            }
          }, 5000);
        }
      } else if (!isRestart) {
        // Active manual microphone / question mode: wait up to 10s for user speech
        clearFollowUpTimer();
        questionWaitTimerRef.current = setTimeout(() => {
          if (sessionId !== activeSessionIdRef.current) return;
          if (
            !transcriptBufferRef.current.trim() &&
            stateRef.current === 'listening'
          ) {
            activeSessionIdRef.current += 1;
            if (recognizerRef.current) {
              try {
                recognizerRef.current.abort();
              } catch {
                // ignore
              }
              recognizerRef.current = null;
            }
            setAssistantState('idle');
            setDebugInfo((prev) => ({
              ...prev,
              isListening: false,
              recognizerStatus: 'IDLE (Timed out waiting for question)',
            }));
            if (settingsRef.current.handsFreeMode) {
              setTimeout(() => {
                if (stateRef.current === 'idle') {
                  startWakeWordListenerRef.current();
                }
              }, 250);
            }
          }
        }, 10000);
      }

      const recognizer = createSpeechRecognizer(
        settings.languagePreference,
        {
          onStart: () => {
            if (sessionId !== activeSessionIdRef.current) return;
            setMicPermission('granted');
            setDebugInfo((prev) => ({
              ...prev,
              micPermission: 'granted',
              micReady: true,
              speechRecReady: true,
              isListening: true,
              wakeWordActive: false,
              recognizerStatus: isFollowUp
                ? 'FOLLOW_UP_LISTENING'
                : 'QUESTION_LISTENING',
            }));
          },
          onResult: (transcript, isFinal) => {
            if (sessionId !== activeSessionIdRef.current) return;
            if (isSubmittingRef.current || isSpeakingRef.current) return;

            const clean = transcript.trim();
            if (!clean) return;

            // Reject acoustic echo of Tia's recent response or ghost repeat of previous query
            if (
              isStaleOrEchoTranscript(
                clean,
                lastTiaSpokenTextRef.current,
                lastSubmittedQuestionRef.current
              )
            ) {
              console.debug('Discarded stale/echo speech in onResult:', clean);
              return;
            }

            // Valid user speech!
            transcriptBufferRef.current = clean;
            setLiveTranscript(clean);

            // Cancel follow-up 5s timeout & question wait timers since user is actively speaking
            clearFollowUpTimer();
            clearQuestionWaitTimer();

            if (stateRef.current !== 'listening') {
              setAssistantState('listening');
            }

            setDebugInfo((prev) => ({
              ...prev,
              isListening: true,
              lastRecognizedSpeech: clean,
              lastRecognizedTimestamp: new Date().toLocaleTimeString(),
              recognizerStatus: `SPEECH_RECEIVED: "${clean}"`,
            }));

            // Debounce question finalization: 900ms if final, 1500ms if interim pause
            clearSpeechSilenceTimer();
            speechSilenceTimerRef.current = setTimeout(() => {
              if (sessionId !== activeSessionIdRef.current) return;
              if (isSubmittingRef.current || isSpeakingRef.current) return;

              const textToSubmit = transcriptBufferRef.current.trim();
              if (
                textToSubmit &&
                !isStaleOrEchoTranscript(
                  textToSubmit,
                  lastTiaSpokenTextRef.current,
                  lastSubmittedQuestionRef.current
                )
              ) {
                activeSessionIdRef.current += 1;
                isSubmittingRef.current = true;
                if (recognizerRef.current) {
                  try {
                    recognizerRef.current.abort();
                  } catch {
                    // ignore
                  }
                  recognizerRef.current = null;
                }
                transcriptBufferRef.current = '';
                setLiveTranscript('');
                setDebugInfo((prev) => ({
                  ...prev,
                  isListening: false,
                  recognizerStatus: 'PROCESSING',
                }));
                submitToTiaRef.current(textToSubmit);
              }
            }, isFinal ? 900 : 1500);
          },
          onError: (errMsg, errCode) => {
            if (sessionId !== activeSessionIdRef.current) return;
            if (errCode === 'no-speech' || errCode === 'aborted') {
              return;
            }
            if (errCode === 'not-allowed' || errCode === 'service-not-allowed') {
              setMicPermission('denied');
              clearFollowUpTimer();
              clearQuestionWaitTimer();
              clearSpeechSilenceTimer();
              setErrorMessage(
                'Microphone access was denied. Please allow microphone access in browser settings.'
              );
              setAssistantState('idle');
              setDebugInfo((prev) => ({
                ...prev,
                micPermission: 'denied',
                micReady: false,
                isListening: false,
                recognizerStatus: 'ERROR: Microphone denied',
              }));
              return;
            }
            clearFollowUpTimer();
            clearQuestionWaitTimer();
            clearSpeechSilenceTimer();
            if (isFollowUp) {
              setAssistantState('idle');
            } else {
              setErrorMessage(errMsg);
              setAssistantState('idle');
              setDebugInfo((prev) => ({
                ...prev,
                isListening: false,
                recognizerStatus: `ERROR: ${errMsg}`,
              }));
            }
            setLiveTranscript('');
          },
          onEnd: () => {
            if (sessionId !== activeSessionIdRef.current) return;
            clearSpeechSilenceTimer();
            if (isSubmittingRef.current || isSpeakingRef.current) return;
            if (stateRef.current === 'thinking' || stateRef.current === 'speaking') return;

            const buffered = transcriptBufferRef.current.trim();
            if (
              buffered &&
              !isStaleOrEchoTranscript(
                buffered,
                lastTiaSpokenTextRef.current,
                lastSubmittedQuestionRef.current
              )
            ) {
              activeSessionIdRef.current += 1;
              isSubmittingRef.current = true;
              clearFollowUpTimer();
              clearQuestionWaitTimer();
              transcriptBufferRef.current = '';
              setLiveTranscript('');
              setDebugInfo((prev) => ({
                ...prev,
                isListening: false,
                recognizerStatus: 'PROCESSING',
              }));
              submitToTiaRef.current(buffered);
              return;
            }

            // In follow-up mode: check if countdown time is still active
            if (stateRef.current === 'follow_up_listening' && followUpEndTimeRef.current) {
              const msLeft = followUpEndTimeRef.current - Date.now();
              if (msLeft > 500 && followUpRestartAttemptsRef.current < 3 && isComponentMounted.current) {
                followUpRestartAttemptsRef.current += 1;
                setTimeout(() => {
                  if (
                    stateRef.current === 'follow_up_listening' &&
                    followUpEndTimeRef.current &&
                    Date.now() < followUpEndTimeRef.current - 300 &&
                    !isSubmittingRef.current
                  ) {
                    startListening(true, true);
                  }
                }, 120);
                return;
              }
              // Time is up: transition to idle
              clearFollowUpTimer();
              setAssistantState('idle');
              setLiveTranscript('');
              setDebugInfo((prev) => ({
                ...prev,
                isListening: false,
                recognizerStatus: 'IDLE (Follow-up 5s window completed)',
              }));
              if (settingsRef.current.handsFreeMode) {
                setTimeout(() => {
                  if (stateRef.current === 'idle') {
                    startWakeWordListenerRef.current();
                  }
                }, 250);
              }
              return;
            }

            // In active question mode: if questionWaitTimer is still running, restart continuous listening
            if (
              stateRef.current === 'listening' &&
              questionWaitTimerRef.current &&
              isComponentMounted.current
            ) {
              setTimeout(() => {
                if (stateRef.current === 'listening' && !isSubmittingRef.current) {
                  startListening(false, true);
                }
              }, 120);
              return;
            }

            // Default fallback to idle
            setAssistantState('idle');
            setLiveTranscript('');
            if (settingsRef.current.handsFreeMode) {
              setTimeout(() => {
                if (stateRef.current === 'idle') {
                  startWakeWordListenerRef.current();
                }
              }, 250);
            }
          },
        },
        { continuous: true, isWakeWordMode: false }
      );

      if (recognizer && sessionId === activeSessionIdRef.current) {
        recognizerRef.current = recognizer;
        recognizer.start();
      } else {
        setAssistantState('idle');
      }
    },
    [
      settings.languagePreference,
      stopSpeech,
      clearFollowUpTimer,
      clearQuestionWaitTimer,
      clearSpeechSilenceTimer,
    ]
  );
  startListeningRef.current = startListening;

  // Passive Hands-Free "Tia" & "Hey Tia" Wake-Word Listener loop
  const startWakeWordListener = useCallback(async () => {
    if (!settings.handsFreeMode || !isSpeechRecognitionSupported()) {
      setDebugInfo((prev) => ({
        ...prev,
        wakeWordActive: false,
        isListening: false,
        recognizerStatus: !settings.handsFreeMode
          ? 'IDLE (Hands-free mode disabled in settings)'
          : 'ERROR (Speech recognition not supported)',
      }));
      return;
    }
    if (
      stateRef.current !== 'idle' ||
      isSpeakingRef.current ||
      isSubmittingRef.current
    ) {
      return;
    }

    const sessionId = ++activeSessionIdRef.current;

    if (recognizerRef.current) {
      try {
        await recognizerRef.current.abortAsync();
      } catch {
        // ignore
      }
      recognizerRef.current = null;
    }

    if (
      sessionId !== activeSessionIdRef.current ||
      stateRef.current !== 'idle' ||
      isSpeakingRef.current ||
      isSubmittingRef.current
    ) {
      return;
    }

    recognitionModeRef.current = 'idle_wake';
    const activeLang = 'en-IN';

    setDebugInfo((prev) => ({
      ...prev,
      wakeWordActive: true,
      isListening: false,
      recognizerStatus: 'WAKE_WORD_LISTENING',
      activeLangCode: activeLang,
    }));

    const recognizer = createSpeechRecognizer(
      settings.languagePreference,
      {
        onStart: () => {
          if (sessionId !== activeSessionIdRef.current) return;
          setDebugInfo((prev) => ({
            ...prev,
            wakeWordActive: true,
            speechRecReady: true,
            isListening: false,
            recognizerStatus: 'WAKE_WORD_LISTENING',
          }));
        },
        onResult: (transcript) => {
          if (sessionId !== activeSessionIdRef.current) return;
          if (
            stateRef.current !== 'idle' ||
            isSpeakingRef.current ||
            isSubmittingRef.current
          ) {
            return;
          }

          setDebugInfo((prev) => ({
            ...prev,
            lastRecognizedSpeech: transcript,
            lastRecognizedTimestamp: new Date().toLocaleTimeString(),
          }));

          const match = detectWakeWord(transcript);
          if (match.detected) {
            activeSessionIdRef.current += 1;
            setDebugInfo((prev) => ({
              ...prev,
              lastWakeDetected: `"${match.matchedPhrase || 'Tia'}" detected at ${new Date().toLocaleTimeString()}`,
              recognizerStatus: `WAKE_WORD_DETECTED: "${match.matchedPhrase || 'Tia'}"`,
            }));

            // 1. Play audio wake chime if enabled
            if (settingsRef.current.wakeChimeEnabled) {
              playWakeChime();
            }

            // 2. If single-breath question (e.g. "Tia, what is GDP?" or "Dia, what is GDP?"):
            if (match.remainderQuery && match.remainderQuery.length > 2) {
              const query = match.remainderQuery.trim();
              // Check if query is an echo of Tia's recent response
              if (
                isStaleOrEchoTranscript(
                  query,
                  lastTiaSpokenTextRef.current,
                  lastSubmittedQuestionRef.current
                )
              ) {
                console.debug('Discarded echo question in wake remainder:', query);
                return;
              }

              if (recognizerRef.current) {
                try {
                  recognizerRef.current.abort();
                } catch {
                  // ignore
                }
                recognizerRef.current = null;
              }
              setAssistantState('thinking');
              setLastUserQuery(query);
              setDebugInfo((prev) => ({
                ...prev,
                wakeWordActive: false,
                isListening: false,
                recognizerStatus: 'PROCESSING',
              }));
              submitToTiaRef.current(query);
              return;
            }

            // 3. User said "Tia", "Dia", "Diya", "Tiya", or "Hey Tia" (standalone wake word)
            // Transition cleanly to question listening!
            setAssistantState('wake_word_detected');
            transitionToQuestionListening();
          }
        },
        onError: (errMsg, errCode) => {
          if (sessionId !== activeSessionIdRef.current) return;
          if (errCode === 'not-allowed' || errCode === 'service-not-allowed') {
            setMicPermission('denied');
            setDebugInfo((prev) => ({
              ...prev,
              micPermission: 'denied',
              micReady: false,
              wakeWordActive: false,
              isListening: false,
              recognizerStatus: 'ERROR: Microphone permission denied',
            }));
          } else if (errCode === 'no-speech' || errCode === 'aborted') {
            // Normal standby behavior
          } else {
            setDebugInfo((prev) => ({
              ...prev,
              recognizerStatus: `Notice: ${errCode || errMsg}`,
            }));
          }
        },
        onEnd: () => {
          if (sessionId !== activeSessionIdRef.current) return;
          // Restart wake word listener if still in idle state and hands-free is enabled
          if (
            stateRef.current === 'idle' &&
            settingsRef.current.handsFreeMode &&
            !isSpeakingRef.current &&
            !isSubmittingRef.current &&
            isComponentMounted.current
          ) {
            wakeRestartTimerRef.current = setTimeout(() => {
              if (
                stateRef.current === 'idle' &&
                settingsRef.current.handsFreeMode &&
                !isSpeakingRef.current &&
                !isSubmittingRef.current
              ) {
                startWakeWordListener();
              }
            }, 250);
          }
        },
      },
      { continuous: true, isWakeWordMode: true }
    );

    if (recognizer && sessionId === activeSessionIdRef.current) {
      recognizerRef.current = recognizer;
      recognizer.start();
    }
  }, [
    settings.handsFreeMode,
    settings.languagePreference,
    transitionToQuestionListening,
  ]);
  startWakeWordListenerRef.current = startWakeWordListener;

  // Simulate wake-word phrase for developer testing and verification
  const handleTestWakeWord = useCallback(
    (simulatedPhrase: string) => {
      setDebugInfo((prev) => ({
        ...prev,
        lastRecognizedSpeech: simulatedPhrase,
        lastRecognizedTimestamp: new Date().toLocaleTimeString(),
      }));

      const match = detectWakeWord(simulatedPhrase);
      if (match.detected) {
        setDebugInfo((prev) => ({
          ...prev,
          lastWakeDetected: `[TEST] "${match.matchedPhrase || simulatedPhrase}" detected at ${new Date().toLocaleTimeString()}`,
          recognizerStatus: `WAKE_WORD_DETECTED: "${match.matchedPhrase || simulatedPhrase}"`,
        }));

        if (settingsRef.current.wakeChimeEnabled) {
          playWakeChime();
        }

        if (match.remainderQuery && match.remainderQuery.length > 2) {
          if (recognizerRef.current) {
            recognizerRef.current.abort();
            recognizerRef.current = null;
          }
          setAssistantState('thinking');
          setLastUserQuery(match.remainderQuery);
          setDebugInfo((prev) => ({
            ...prev,
            wakeWordActive: false,
            isListening: false,
            recognizerStatus: 'PROCESSING',
          }));
          submitToTiaRef.current(match.remainderQuery);
        } else {
          setAssistantState('wake_word_detected');
          transitionToQuestionListening();
        }
      } else {
        setDebugInfo((prev) => ({
          ...prev,
          lastWakeDetected: null,
          recognizerStatus: `REJECTED: "${simulatedPhrase}" is NOT a wake phrase`,
        }));
      }
    },
    [transitionToQuestionListening]
  );

  // Auto-activate wake word listener on first user interaction if browser policy blocked auto-listening
  useEffect(() => {
    const handleGestureUnlock = () => {
      if (stateRef.current === 'idle' && settingsRef.current.handsFreeMode) {
        if (!recognizerRef.current) {
          startWakeWordListener();
        }
      }
    };
    window.addEventListener('click', handleGestureUnlock, { once: true });
    window.addEventListener('touchstart', handleGestureUnlock, { once: true });
    return () => {
      window.removeEventListener('click', handleGestureUnlock);
      window.removeEventListener('touchstart', handleGestureUnlock);
    };
  }, [startWakeWordListener]);

  // Manage Wake-Word Loop when assistant is idle
  useEffect(() => {
    if (
      assistantState === 'idle' &&
      settings.handsFreeMode &&
      !isSpeakingRef.current &&
      !isSubmittingRef.current
    ) {
      startWakeWordListener();
    } else if (assistantState !== 'idle' && recognitionModeRef.current === 'idle_wake') {
      activeSessionIdRef.current += 1;
      if (recognizerRef.current) {
        try {
          recognizerRef.current.abort();
        } catch {
          // ignore
        }
        recognizerRef.current = null;
      }
    }

    return () => {
      if (wakeRestartTimerRef.current) clearTimeout(wakeRestartTimerRef.current);
      if (wakeTransitionTimerRef.current) clearTimeout(wakeTransitionTimerRef.current);
    };
  }, [assistantState, settings.handsFreeMode, startWakeWordListener]);

  // Handle Voice Orb click (supports barge-in interruption)
  const handleOrbClick = useCallback(() => {
    if (assistantState === 'listening' || assistantState === 'follow_up_listening') {
      stopListening();
    } else if (assistantState === 'speaking') {
      // Barge-in: immediately stop speaking and switch to listening
      stopSpeech();
      startListening(false);
    } else if (assistantState === 'wake_word_detected') {
      startListening(false);
    } else if (assistantState === 'idle') {
      startListening(false);
    }
  }, [assistantState, startListening, stopListening, stopSpeech]);

  // Request explicit mic permission
  const handleRequestMicPermission = useCallback(async () => {
    const granted = await requestMicrophoneAccess();
    if (granted) {
      setMicPermission('granted');
      if (assistantState === 'idle' && settings.handsFreeMode) {
        startWakeWordListener();
      }
    } else {
      setMicPermission('denied');
      setErrorMessage(
        'Microphone permission is blocked. Please enable microphone permissions in your browser or site settings.'
      );
    }
  }, [assistantState, settings.handsFreeMode, startWakeWordListener]);

  // Test voice in settings
  const handleTestVoice = useCallback(() => {
    const sampleText = settings.funnyMode
      ? 'Namaste! Main hoon Tia, aapki funny Indian AI dost. Economics ho, GDP ho, ya mast ideas—sab bindaas poochho!'
      : 'Hello! I am Tia, your personal Indian voice assistant. How can I help you today?';
    speakResponse(
      sampleText,
      settings.funnyMode ? 'playful' : 'happy',
      'hinglish'
    );
  }, [settings.funnyMode, speakResponse]);

  // Reset conversation memory
  const handleClearConversation = useCallback(() => {
    clearFollowUpTimer();
    clearQuestionWaitTimer();
    clearSpeechSilenceTimer();
    stopSpeech();
    setMessages([]);
    setLastUserQuery(null);
    setLiveTranscript('');
    setErrorMessage(null);
    setAssistantState('idle');

    const token = authSession?.token || localStorage.getItem('tia_auth_token');
    if (token) {
      fetch('/api/conversations', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      }).catch((err) => console.warn('Failed to clear conversations:', err));
    }
  }, [authSession?.token, stopSpeech, clearFollowUpTimer, clearQuestionWaitTimer, clearSpeechSilenceTimer]);

  // Update Owner Profile in persistent backend DB & local state
  const handleUpdateOwnerProfile = useCallback(
    async (updater: Partial<OwnerProfile>) => {
      try {
        const token = authSession?.token || localStorage.getItem('tia_auth_token');
        const res = await fetch('/api/profile', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(updater),
        });
        const data = await parseApiResponse(res, '/api/profile');
        if (data && data.profile) {
          setOwnerProfile(data.profile);
          localStorage.setItem('tia_owner_profile', JSON.stringify(data.profile));
        }
      } catch (err) {
        console.error('Failed to update owner profile:', err);
      }
    },
    [authSession?.token]
  );

  // Add a persistent memory fact
  const handleAddMemory = useCallback(async (fact: string) => {
    try {
      const token = authSession?.token || localStorage.getItem('tia_auth_token');
      const res = await fetch('/api/profile/remember', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ fact, category: 'user_requested' }),
      });
      const data = await parseApiResponse(res, '/api/profile/remember');
      if (data && data.profile) {
        setOwnerProfile(data.profile);
        localStorage.setItem('tia_owner_profile', JSON.stringify(data.profile));
      }
    } catch (err) {
      console.error('Failed to add memory:', err);
    }
  }, [authSession?.token]);

  // Delete a persistent memory fact
  const handleDeleteMemory = useCallback(async (id: string) => {
    try {
      const token = authSession?.token || localStorage.getItem('tia_auth_token');
      const res = await fetch(`/api/profile/memory?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const data = await parseApiResponse(res, '/api/profile/memory');
      if (data && data.profile) {
        setOwnerProfile(data.profile);
        localStorage.setItem('tia_owner_profile', JSON.stringify(data.profile));
      }
    } catch (err) {
      console.error('Failed to delete memory:', err);
    }
  }, [authSession?.token]);

  // Reset owner profile back to defaults
  const handleResetProfile = useCallback(async () => {
    try {
      const token = authSession?.token || localStorage.getItem('tia_auth_token');
      const res = await fetch('/api/profile/reset', {
        method: 'POST',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const data = await parseApiResponse(res, '/api/profile/reset');
      if (data && data.profile) {
        setOwnerProfile(data.profile);
        localStorage.setItem('tia_owner_profile', JSON.stringify(data.profile));
      }
    } catch (err) {
      console.error('Failed to reset profile:', err);
    }
  }, [authSession?.token]);

  // Auth: Handle Successful Login / Signup
  const handleLoginSuccess = useCallback(
    (session: AuthSession) => {
      setAuthSession(session);
      setUserProfile(session.profile);
      localStorage.setItem('tia_auth_session', JSON.stringify(session));
      localStorage.setItem('tia_auth_token', session.token);
      localStorage.setItem('tia_user_profile', JSON.stringify(session.profile));

      const mappedOwner: OwnerProfile = {
        name: session.profile.full_name || 'Owner',
        relationship: 'owner',
        location: session.profile.location || session.profile.address || '',
        occupation_status: session.profile.current_work || session.profile.occupation_status || 'Explorer',
        personality_traits: ['intelligent', 'curious', 'ambitious'],
        additional_memories: [],
        last_updated: new Date().toISOString(),
      };
      setOwnerProfile(mappedOwner);
      localStorage.setItem('tia_owner_profile', JSON.stringify(mappedOwner));

      // Friendly personalized welcome by Tia
      const firstName = session.profile.full_name.split(' ')[0] || session.profile.full_name;
      const isNew = !!session.isNewUser;
      const greetingText = isNew
        ? `Hey! 👋 Main Tia hoon. Lagta hai hum pehli baar officially mil rahe hain 😄 Chalo, pehle tumhare baare mein thoda jaan leti hoon. Welcome, ${firstName}!`
        : `Welcome back, ${firstName}! 😎 Tia is ready. Aaj kya plan hai?`;

      const greetMsg: Message = {
        id: `tia-welcome-${Date.now()}`,
        role: 'assistant',
        content: greetingText,
        timestamp: Date.now(),
        emotion: 'playful',
        voiceName: 'Tia (Default)',
        detectedLanguage: 'hinglish',
      };
      setMessages([greetMsg]);

      if (settings.voiceEnabled) {
        speakResponse(greetingText, 'playful', 'hinglish', 'chat', 'female');
      }
    },
    [settings.voiceEnabled, speakResponse]
  );

  // Auth: Handle Logout
  const handleLogout = useCallback(async () => {
    stopSpeech();
    if (recognizerRef.current) {
      recognizerRef.current.abort();
      recognizerRef.current = null;
    }
    const token = authSession?.token || localStorage.getItem('tia_auth_token');
    if (token) {
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        });
      } catch {
        // ignore
      }
    }
    localStorage.removeItem('tia_auth_session');
    localStorage.removeItem('tia_auth_token');
    localStorage.removeItem('tia_user_profile');
    localStorage.removeItem('tia_owner_profile');
    setAuthSession(null);
    setUserProfile(null);
    setOwnerProfile(null);
    setMessages([]);
    setAssistantState('idle');
  }, [authSession?.token, stopSpeech]);

  const lastAssistantMsg =
    [...messages].reverse().find((m) => m.role === 'assistant') || null;

  const isDark = settings.theme === 'dark';

  // If unauthenticated, render the full AuthScreen
  if (!authSession) {
    return (
      <AuthScreen
        onAuthSuccess={handleLoginSuccess}
        isDark={isDark}
      />
    );
  }

  return (
    <main
      id="tia-app-root"
      className={`relative w-full h-screen h-[100dvh] flex flex-col justify-between overflow-hidden ${
        isDark ? 'bg-[#0b0f19] text-slate-100' : 'bg-slate-50 text-slate-900'
      }`}
    >
      {/* Decorative background aura radial gradients */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top Header */}
      <Header
        settings={settings}
        onUpdateSettings={(updater) =>
          setSettings((prev) => ({ ...prev, ...updater }))
        }
        onOpenSettings={() => setIsSettingsOpen(true)}
        isDark={isDark}
        ownerProfile={ownerProfile}
        onLogout={handleLogout}
      />

      {/* Error / Permission Toast Notification */}
      <ErrorMessage
        message={errorMessage}
        onDismiss={() => setErrorMessage(null)}
        onRetry={() => startListening(false)}
      />

      {/* Center Stage: Voice Orb & Floating Conversation */}
      <div className="flex-1 w-full max-w-xl mx-auto flex flex-col items-center justify-center px-4 overflow-y-auto">
        {/* Animated AI Voice Presence Orb */}
        <VoiceOrb
          state={assistantState}
          onClick={handleOrbClick}
          isDark={isDark}
          emotion={currentEmotion}
          currentVoiceLabel={currentVoiceName}
          followUpRemainingSeconds={followUpRemaining}
          handsFreeMode={settings.handsFreeMode}
        />

        {/* Minimalist Spoken Conversation Preview */}
        <ConversationPreview
          lastMessage={lastAssistantMsg}
          lastUserQuery={lastUserQuery}
          state={assistantState}
          onReplay={(msg) =>
            speakResponse(
              msg.content,
              msg.emotion,
              (msg.detectedLanguage as any) || 'hinglish'
            )
          }
          onStopSpeech={stopSpeech}
          onSelectPrompt={(prompt) => submitToTia(prompt)}
          allMessages={messages}
          isDark={isDark}
        />
      </div>

      {/* Bottom Voice Controls & Mic button */}
      <VoiceControls
        state={assistantState}
        onStartListening={() => startListening(false)}
        onStopListening={stopListening}
        onStopSpeech={() => {
          stopSpeech();
          startListening(false);
        }}
        onSubmitText={submitToTia}
        liveTranscript={liveTranscript}
        isDark={isDark}
        handsFreeMode={settings.handsFreeMode}
        followUpRemainingSeconds={followUpRemaining}
        micPermission={micPermission}
        onRequestMicPermission={handleRequestMicPermission}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onUpdateSettings={(updater) =>
          setSettings((prev) => ({ ...prev, ...updater }))
        }
        onClearConversation={handleClearConversation}
        availableVoices={availableVoices}
        onTestVoice={handleTestVoice}
        isDark={isDark}
        ownerProfile={ownerProfile}
        userProfile={userProfile}
        authEmail={authSession.user.email}
        authPhone={authSession.user.phone_number || userProfile?.phone_number}
        onLogout={handleLogout}
        onUpdateOwnerProfile={handleUpdateOwnerProfile}
        onAddMemory={handleAddMemory}
        onDeleteMemory={handleDeleteMemory}
        onResetProfile={handleResetProfile}
        onAskTia={submitToTia}
      />

      {/* Real-time Hands-Free "Hey Tia" Diagnostics Bar */}
      <WakeWordDebugIndicator
        debugInfo={debugInfo}
        onTestWakeWord={handleTestWakeWord}
        onRestartListener={() => {
          if (assistantState === 'idle') {
            startWakeWordListener();
          }
        }}
        onRequestMic={handleRequestMicPermission}
        isDark={isDark}
      />
    </main>
  );
}

