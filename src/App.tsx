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
  TiaLocalProfile,
} from './types';
import { Header } from './components/Header';
import { VoiceOrb } from './components/VoiceOrb';
import { VoiceControls } from './components/VoiceControls';
import { ConversationPreview } from './components/ConversationPreview';
import { SettingsModal } from './components/SettingsModal';
import { ErrorMessage } from './components/ErrorMessage';
import { PersonalizeScreen } from './components/PersonalizeScreen';
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
  evaluateWakeAlternatives,
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

const DEFAULT_OWNER_PROFILE: OwnerProfile = {
  name: 'Anurag',
  relationship: 'owner',
  location: 'Patna, India',
  occupation_status: 'working on a startup',
  personality_traits: ['intelligent', 'curious', 'ambitious'],
  additional_memories: [
    {
      id: 'mem-init-1',
      fact: 'Anurag is the creator and owner of Tia.',
      category: 'identity',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'mem-init-2',
      fact: 'Anurag lives in Patna, India and is building a startup.',
      category: 'work',
      createdAt: new Date().toISOString(),
    },
  ],
  last_updated: new Date().toISOString(),
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

  // User Profile & Identity State
  const [authSession, setAuthSession] = useState<AuthSession | null>(() => {
    try {
      const cached = localStorage.getItem('tia_auth_session');
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });

  // Local Personal Profile State (stored strictly in user's browser via localStorage: 'tia_user_profile')
  const [localProfile, setLocalProfile] = useState<TiaLocalProfile | null>(() => {
    try {
      const cached = localStorage.getItem('tia_user_profile');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && typeof parsed === 'object') {
          const profileName = (parsed.name || parsed.full_name || '').trim();
          if (profileName) {
            return {
              name: profileName,
              place: (parsed.place || parsed.location || parsed.address || '').trim(),
              work: (parsed.work || parsed.current_work || parsed.occupation_status || '').trim(),
              interests: (parsed.interests || '').trim(),
              createdAt: parsed.createdAt || new Date().toISOString(),
              updatedAt: parsed.updatedAt || new Date().toISOString(),
            };
          }
        }
      }
    } catch {
      // ignore
    }
    return null;
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
  const [ownerProfile, setOwnerProfile] = useState<OwnerProfile>(() => {
    try {
      const cached = localStorage.getItem('tia_owner_profile');
      if (cached) return JSON.parse(cached);
    } catch {
      // ignore
    }
    return DEFAULT_OWNER_PROFILE;
  });

  // Load persistent owner profile and memories on mount without requiring login
  useEffect(() => {
    const token = authSession?.token || localStorage.getItem('tia_auth_token');
    fetch('/api/profile', {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    })
      .then((res) => parseApiResponse(res, '/api/profile'))
      .then((data) => {
        if (data?.profile) {
          setUserProfile(data.profile);
          const mappedOwner: OwnerProfile = {
            name: data.profile.full_name || 'Anurag',
            relationship: 'owner',
            location: data.profile.location || data.profile.address || 'Patna, India',
            occupation_status:
              data.profile.current_work ||
              data.profile.occupation_status ||
              'working on a startup',
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
        console.warn('Could not load profile from server:', err);
      });
  }, [authSession?.token]);

  // Load conversation history on mount without requiring login
  useEffect(() => {
    const token = authSession?.token || localStorage.getItem('tia_auth_token');
    fetch('/api/conversations', {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
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
  const wakeTriggeredRef = useRef<boolean>(false);

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
      document.body.className =
        'bg-slate-100 text-slate-900 antialiased overflow-hidden select-none';
    } else {
      document.documentElement.classList.add('dark');
      document.body.className =
        'bg-[#0b0f19] text-slate-100 antialiased overflow-hidden select-none';
    }
  }, [settings.theme]);

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
          recognizerRef.current.resetUtterance?.();
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
      setAssistantState('speaking');

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
        detectedLanguage,
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
          recognizerRef.current.resetUtterance?.();
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
            localProfile,
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
      localProfile,
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
      recognizerRef.current?.resetUtterance?.();
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

    wakeTriggeredRef.current = false;
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
      wakeTriggered: false,
    }));

    const handleWakeEvaluation = (
      alternatives: string[],
      isFinal: boolean
    ) => {
      if (sessionId !== activeSessionIdRef.current) return;
      if (wakeTriggeredRef.current) return;
      if (
        stateRef.current !== 'idle' ||
        isSpeakingRef.current ||
        isSubmittingRef.current
      ) {
        return;
      }

      const evalResult = evaluateWakeAlternatives(
        alternatives,
        sessionId,
        isFinal
      );

      console.log(
        `[WakeDetector] Session: ${sessionId} | Status: ${isFinal ? 'final' : 'interim'} | Raw: "${evalResult.rawResult}" | Normalized: "${evalResult.normalizedResult}" | Alternatives: ${JSON.stringify(alternatives)} | Matched: "${evalResult.matchedPhrase || 'none'}" | Wake: ${evalResult.detected} | wakeTriggered: ${wakeTriggeredRef.current}`
      );

      setDebugInfo((prev) => ({
        ...prev,
        lastRecognizedSpeech: evalResult.rawResult,
        lastRecognizedTimestamp: new Date().toLocaleTimeString(),
        lastAlternatives: alternatives,
        lastMatchedAlias: evalResult.matchedPhrase || undefined,
      }));

      if (evalResult.detected) {
        // Prevent duplicate firing for the same spoken utterance (e.g. interim then final)
        wakeTriggeredRef.current = true;
        activeSessionIdRef.current += 1;

        if (recognizerRef.current) {
          try {
            recognizerRef.current.abort();
          } catch {
            // ignore
          }
          recognizerRef.current = null;
        }

        const matchedWord = evalResult.matchedPhrase || 'Tia';
        setDebugInfo((prev) => ({
          ...prev,
          lastWakeDetected: `"${matchedWord}" detected at ${new Date().toLocaleTimeString()}`,
          recognizerStatus: `WAKE_WORD_DETECTED: "${matchedWord}"`,
          wakeTriggered: true,
        }));

        // 1. Play audio wake chime if enabled
        if (settingsRef.current.wakeChimeEnabled) {
          playWakeChime();
        }

        // 2. If single-breath question (e.g. "Tia, what is GDP?" or "Dia, what is GDP?"):
        if (evalResult.remainderQuery && evalResult.remainderQuery.length > 2) {
          const query = evalResult.remainderQuery.trim();
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
    };

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
        onNewResult: ({ alternatives, isFinal }) => {
          handleWakeEvaluation(alternatives, isFinal);
        },
        onResult: (transcript, isFinal) => {
          handleWakeEvaluation([transcript], isFinal);
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
          if (wakeTriggeredRef.current) return;

          // Restart wake word listener if still in idle state and hands-free is enabled
          if (
            stateRef.current === 'idle' &&
            settingsRef.current.handsFreeMode &&
            !isSpeakingRef.current &&
            !isSubmittingRef.current &&
            !wakeTriggeredRef.current &&
            isComponentMounted.current
          ) {
            wakeRestartTimerRef.current = setTimeout(() => {
              if (
                stateRef.current === 'idle' &&
                settingsRef.current.handsFreeMode &&
                !isSpeakingRef.current &&
                !isSubmittingRef.current &&
                !wakeTriggeredRef.current
              ) {
                startWakeWordListener();
              }
            }, 250);
          }
        },
      },
      { continuous: true, isWakeWordMode: true, maxAlternatives: 5 }
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

      const evalResult = evaluateWakeAlternatives([simulatedPhrase], activeSessionIdRef.current, true);
      if (evalResult.detected) {
        const matchedName = evalResult.matchedPhrase || simulatedPhrase;
        setDebugInfo((prev) => ({
          ...prev,
          lastWakeDetected: `[TEST] "${matchedName}" detected at ${new Date().toLocaleTimeString()}`,
          recognizerStatus: `WAKE_WORD_DETECTED: "${matchedName}"`,
          lastMatchedAlias: matchedName,
          wakeTriggered: true,
        }));

        if (settingsRef.current.wakeChimeEnabled) {
          playWakeChime();
        }

        if (evalResult.remainderQuery && evalResult.remainderQuery.length > 2) {
          if (recognizerRef.current) {
            recognizerRef.current.abort();
            recognizerRef.current = null;
          }
          setAssistantState('thinking');
          setLastUserQuery(evalResult.remainderQuery);
          setDebugInfo((prev) => ({
            ...prev,
            wakeWordActive: false,
            isListening: false,
            recognizerStatus: 'PROCESSING',
          }));
          submitToTiaRef.current(evalResult.remainderQuery);
        } else {
          setAssistantState('wake_word_detected');
          transitionToQuestionListening();
        }
      } else {
        setDebugInfo((prev) => ({
          ...prev,
          lastWakeDetected: null,
          lastMatchedAlias: undefined,
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

  // Handle first-time personal profile saving (stored strictly in browser's localStorage)
  const handleSavePersonalProfile = useCallback((profile: TiaLocalProfile) => {
    try {
      localStorage.setItem('tia_user_profile', JSON.stringify(profile));
    } catch (err) {
      console.warn('Could not save local user profile to localStorage:', err);
    }
    setLocalProfile(profile);

    const greetingMsg: Message = {
      id: `tia-greeting-${Date.now()}`,
      role: 'assistant',
      content: `Hi ${profile.name} 👋 I'm Tia. How can I help you?`,
      timestamp: Date.now(),
      emotion: 'happy',
      voiceName: 'Tia Hindi/English',
      detectedLanguage: 'english',
    };
    setMessages([greetingMsg]);
  }, []);

  // Handle personal profile update (from Settings Modal)
  const handleUpdateLocalProfile = useCallback((updated: TiaLocalProfile) => {
    try {
      localStorage.setItem('tia_user_profile', JSON.stringify(updated));
    } catch (err) {
      console.warn('Could not update local user profile in localStorage:', err);
    }
    setLocalProfile(updated);
  }, []);

  // Handle personal profile reset (removes local profile from browser and reopens Personalize setup)
  const handleResetLocalProfile = useCallback(() => {
    try {
      localStorage.removeItem('tia_user_profile');
    } catch (err) {
      console.warn('Could not remove local user profile from localStorage:', err);
    }
    setLocalProfile(null);
    setMessages([]);
    setIsSettingsOpen(false);
  }, []);

  // Default greeting for recognized local user on clean load
  useEffect(() => {
    if (localProfile?.name && messages.length === 0) {
      setMessages([
        {
          id: `tia-greeting-${Date.now()}`,
          role: 'assistant',
          content: `Hi ${localProfile.name} 👋 I'm Tia. How can I help you?`,
          timestamp: Date.now(),
          emotion: 'happy',
          voiceName: 'Tia Hindi/English',
          detectedLanguage: 'english',
        },
      ]);
    }
  }, [localProfile?.name]);

  const lastAssistantMsg =
    [...messages].reverse().find((m) => m.role === 'assistant') || null;

  const isDark = settings.theme === 'dark';

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

      {/* First-Time "Personalize Tia" Screen (when no local profile exists in browser) */}
      {!localProfile && (
        <PersonalizeScreen
          isDark={isDark}
          onContinue={handleSavePersonalProfile}
        />
      )}

      {/* Top Header */}
      <Header
        settings={settings}
        onUpdateSettings={(updater) =>
          setSettings((prev) => ({ ...prev, ...updater }))
        }
        onOpenSettings={() => setIsSettingsOpen(true)}
        isDark={isDark}
        localProfile={localProfile}
        ownerProfile={ownerProfile}
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
        localProfile={localProfile}
        onUpdateLocalProfile={handleUpdateLocalProfile}
        onResetLocalProfile={handleResetLocalProfile}
        ownerProfile={ownerProfile}
        userProfile={userProfile}
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

