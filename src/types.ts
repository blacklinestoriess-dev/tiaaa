export type AssistantState =
  | 'idle'
  | 'wake_word_detected'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'follow_up_listening';

export type VoiceState =
  | 'IDLE'
  | 'WAKE_WORD_LISTENING'
  | 'WAKE_WORD_DETECTED'
  | 'QUESTION_LISTENING'
  | 'USER_SPEECH_RECEIVED'
  | 'PROCESSING'
  | 'TIA_SPEAKING'
  | 'AUDIO_SETTLE'
  | 'FOLLOW_UP_LISTENING';

export type TiaEmotion =
  | 'neutral'
  | 'happy'
  | 'playful'
  | 'funny'
  | 'excited'
  | 'curious'
  | 'calm'
  | 'serious'
  | 'empathetic'
  | 'reassuring';

export type ContextType =
  | 'chat'
  | 'educational'
  | 'humor'
  | 'serious'
  | 'exciting'
  | 'advice';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  model?: string;
  emotion?: TiaEmotion;
  voiceName?: string;
  detectedLanguage?: 'hindi' | 'hinglish' | 'english';
}

export type LanguagePreference = 'auto' | 'hinglish' | 'hindi' | 'english';

export interface TiaSettings {
  voiceEnabled: boolean;
  speechRate: number;
  languagePreference: LanguagePreference;
  funnyMode: boolean;
  theme: 'dark' | 'light';
  selectedVoiceURI: string;
  autoVoiceSelection: boolean;
  // Hands-free & Wake word configurations
  handsFreeMode: boolean;
  followUpTimeoutSeconds: number; // 3 to 5 seconds, default 4
  wakeChimeEnabled: boolean;
}

export interface SpeechVoiceOption {
  name: string;
  lang: string;
  voiceURI: string;
  isIndian: boolean;
  isFemale: boolean;
  isMale: boolean;
  isNatural: boolean;
}

export interface VoiceSelectionCriteria {
  emotion: TiaEmotion;
  detectedLanguage: 'hindi' | 'hinglish' | 'english';
  contextType?: ContextType;
  preferredGender?: 'female' | 'male' | 'any';
  userPreferenceURI?: string;
}

// Lightweight Personal User Profile (Stored ONLY in browser localStorage)
export interface TiaLocalProfile {
  name: string;
  place?: string;
  work?: string;
  interests?: string;
}

// User Profile Database Schema
export interface UserProfile {
  id: string;
  user_id: string;
  full_name: string;
  username: string;
  date_of_birth: string; // YYYY-MM-DD
  location: string; // Location / City
  current_work: string; // Current Work / Role
  age: number; // Dynamically calculated from date_of_birth
  address?: string; // Compatibility alias for location
  occupation_status?: string; // Compatibility alias for current_work
  phone_number?: string;
  gender?: string;
  profile_picture?: string;
  created_at: string;
  updated_at: string;
}

// Private Personal Memory Schema
export interface UserMemory {
  id: string;
  user_id: string;
  memory_key: string;
  memory_value: string;
  memory_type: 'preference' | 'identity' | 'work' | 'personal' | 'general' | 'user_requested';
  created_at: string;
  updated_at?: string;
}

// Authenticated User Identity
export interface AuthUser {
  id: string;
  username: string;
  phone_number?: string;
  email?: string;
  supabase_id?: string;
  created_at?: string;
  updated_at?: string;
}

// Active Authentication Session
export interface AuthSession {
  token: string;
  user: AuthUser;
  profile: UserProfile;
  isNewUser?: boolean;
}

// Backward-compatible aliases for existing components
export interface OwnerMemory {
  id: string;
  fact: string;
  category?: 'work' | 'personal' | 'preference' | 'identity' | 'general' | 'user_requested';
  createdAt: string;
  updatedAt?: string;
}

export interface OwnerProfile {
  name: string;
  relationship: 'owner';
  location: string;
  occupation_status: string;
  personality_traits: string[];
  additional_memories: OwnerMemory[];
  custom_fields?: Record<string, string>;
  last_updated: string;
}
