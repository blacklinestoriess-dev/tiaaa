import React, { useState, useEffect } from 'react';
import type {
  TiaSettings,
  SpeechVoiceOption,
  OwnerProfile,
  UserProfile,
  TiaLocalProfile,
  TTSLiveStatus,
} from '../types';
import {
  X,
  Volume2,
  VolumeX,
  Languages,
  Smile,
  Trash2,
  Info,
  Sliders,
  Check,
  Play,
  Sparkles,
  Zap,
  UserCheck,
  MapPin,
  Briefcase,
  Brain,
  Plus,
  RotateCcw,
  Edit2,
  MessageSquare,
  Calendar,
  Mail,
  ShieldCheck,
  Heart,
  Square,
  CheckCircle,
  AlertTriangle,
} from 'lucide-react';

const TEST_SAMPLE_SENTENCES = [
  {
    id: 1,
    label: 'Sentence 1',
    text: 'Boss, aaj kya plan hai? Kuch interesting karte hain!',
    target: 'Expressive greeting & English "interesting"',
  },
  {
    id: 2,
    label: 'Sentence 2',
    text: 'Chalo, ab is energy ko use karke kuch dhamakedar karte hain.',
    target: 'English verb "use" (/juːz/) instead of Hindi "उसे"',
  },
  {
    id: 3,
    label: 'Sentence 3',
    text: 'Aaj mere servers thode zyada hi happy mood mein hain.',
    target: 'Hindi particle "ही" instead of English "high"',
  },
  {
    id: 4,
    label: 'Sentence 4',
    text: 'Main abhi tumhari help karti hoon.',
    target: 'Natural Hindi grammar + English "help"',
  },
  {
    id: 5,
    label: 'Sentence 5',
    text: 'Wait, Boss! Pehle poori baat toh sun lo.',
    target: 'Conversational pause & natural pacing',
  },
];

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: TiaSettings;
  onUpdateSettings: (updater: Partial<TiaSettings>) => void;
  onClearConversation: () => void;
  availableVoices: SpeechVoiceOption[];
  onTestVoice: () => void;
  isDark: boolean;
  localProfile: TiaLocalProfile | null;
  onUpdateLocalProfile: (profile: TiaLocalProfile) => void;
  onResetLocalProfile: () => void;
  ownerProfile?: OwnerProfile | null;
  userProfile?: UserProfile | null;
  onUpdateOwnerProfile?: (updater: Partial<OwnerProfile>) => void;
  onAddMemory?: (fact: string) => void;
  onDeleteMemory?: (id: string) => void;
  onResetProfile?: () => void;
  onAskTia?: (prompt: string) => void;
  ttsLiveStatus?: TTSLiveStatus | null;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  onClearConversation,
  availableVoices,
  onTestVoice,
  isDark,
  localProfile,
  onUpdateLocalProfile,
  onResetLocalProfile,
  ownerProfile,
  userProfile,
  onUpdateOwnerProfile,
  onAddMemory,
  onDeleteMemory,
  onResetProfile,
  onAskTia,
  ttsLiveStatus,
}) => {
  const [showAbout, setShowAbout] = useState(false);
  const [clearedConfirm, setClearedConfirm] = useState(false);
  const [newMemoryInput, setNewMemoryInput] = useState('');
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editName, setEditName] = useState(localProfile?.name || '');
  const [editPlace, setEditPlace] = useState(localProfile?.place || '');
  const [editWork, setEditWork] = useState(localProfile?.work || '');
  const [editInterests, setEditInterests] = useState(localProfile?.interests || '');
  const [editError, setEditError] = useState<string | null>(null);
  const [playingSampleId, setPlayingSampleId] = useState<number | null>(null);
  const sampleAudioRef = React.useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (sampleAudioRef.current) {
        sampleAudioRef.current.pause();
        sampleAudioRef.current = null;
      }
    };
  }, []);

  const handlePlaySample = (sampleId: number) => {
    if (sampleAudioRef.current) {
      sampleAudioRef.current.pause();
      sampleAudioRef.current = null;
    }

    if (playingSampleId === sampleId) {
      setPlayingSampleId(null);
      return;
    }

    const voice = (settings.premiumVoiceId || 'Aoede').toLowerCase();
    const audioUrl = `/audio_samples/${voice}_sentence_${sampleId}.wav`;
    const audio = new Audio(audioUrl);
    sampleAudioRef.current = audio;
    setPlayingSampleId(sampleId);

    audio.onended = () => {
      if (sampleAudioRef.current === audio) {
        sampleAudioRef.current = null;
      }
      setPlayingSampleId(null);
    };

    audio.onerror = () => {
      console.warn('Audio sample playback error, reverting sample state');
      if (sampleAudioRef.current === audio) {
        sampleAudioRef.current = null;
      }
      setPlayingSampleId(null);
    };

    audio.play().catch((err) => {
      console.warn('Audio play caught:', err);
      setPlayingSampleId(null);
    });
  };

  useEffect(() => {
    if (localProfile) {
      setEditName(localProfile.name || '');
      setEditPlace(localProfile.place || '');
      setEditWork(localProfile.work || '');
      setEditInterests(localProfile.interests || '');
    }
  }, [localProfile, isEditingProfile]);

  if (!isOpen) return null;

  const handleClear = () => {
    onClearConversation();
    setClearedConfirm(true);
    setTimeout(() => setClearedConfirm(false), 2000);
  };

  const handleSaveProfileEdit = () => {
    const trimmed = editName.trim();
    if (!trimmed) {
      setEditError('Name is required');
      return;
    }
    onUpdateLocalProfile({
      name: trimmed,
      place: editPlace.trim() || undefined,
      work: editWork.trim() || undefined,
      interests: editInterests.trim() || undefined,
    });
    setIsEditingProfile(false);
    setEditError(null);
  };

  const handleResetLocalProfile = () => {
    if (
      window.confirm(
        'Reset your profile? This will clear your personal profile from this device and return you to the setup screen.'
      )
    ) {
      onResetLocalProfile();
      onClose();
    }
  };

  const handleAddNewMemory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemoryInput.trim()) return;
    if (onAddMemory) {
      onAddMemory(newMemoryInput.trim());
    }
    setNewMemoryInput('');
  };

  const handleQuickAsk = (prompt: string) => {
    onClose();
    if (onAskTia) {
      onAskTia(prompt);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div
        id="settings-dialog"
        className={`w-full max-w-md max-h-[85vh] flex flex-col rounded-3xl border shadow-2xl overflow-hidden transition-all ${
          isDark
            ? 'bg-[#0f172a] border-white/10 text-slate-100'
            : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center space-x-2">
            <Sliders className="w-5 h-5 text-rose-500" />
            <h2 className="text-base font-bold font-display">Tia Settings</h2>
          </div>
          <button
            type="button"
            id="btn-close-settings"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer"
            aria-label="Close settings"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6 text-sm">
          {/* PERSONAL USER PROFILE SECTION (LOCAL DEVICE STORAGE) */}
          <div
            id="personal-profile-card"
            className={`p-4 rounded-2xl border space-y-3.5 transition-all ${
              isDark
                ? 'bg-rose-950/20 border-rose-500/25 text-slate-200'
                : 'bg-rose-50/70 border-rose-200 text-slate-800'
            }`}
          >
            {/* Section Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="p-1.5 rounded-lg bg-rose-500/20 text-rose-400">
                  <UserCheck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm leading-tight flex items-center space-x-1.5">
                    <span>Personal Profile</span>
                    <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30">
                      This Device • Local
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Stored on this device. Tia recognizes you as {localProfile?.name || 'Friend'}.
                  </p>
                </div>
              </div>
              <button
                type="button"
                id="btn-edit-owner-profile"
                onClick={() => {
                  setEditName(localProfile?.name || '');
                  setEditPlace(localProfile?.place || '');
                  setEditWork(localProfile?.work || '');
                  setEditInterests(localProfile?.interests || '');
                  setEditError(null);
                  setIsEditingProfile(!isEditingProfile);
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                title="Edit profile details"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Profile Fields or Edit Form */}
            {isEditingProfile ? (
              <div className="space-y-2.5 pt-1">
                {editError && (
                  <p className="text-xs text-rose-400 font-medium">{editError}</p>
                )}
                <div>
                  <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                    Name <span className="text-rose-400">*</span>:
                  </label>
                  <input
                    type="text"
                    id="input-edit-name"
                    value={editName}
                    onChange={(e) => {
                      setEditName(e.target.value);
                      if (editError) setEditError(null);
                    }}
                    className={`w-full px-3 py-1.5 rounded-xl text-xs border outline-none ${
                      isDark
                        ? 'bg-slate-900 border-white/10 text-white'
                        : 'bg-white border-slate-300 text-slate-900'
                    }`}
                    placeholder="e.g. Rahul"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                    Place / City (Optional):
                  </label>
                  <input
                    type="text"
                    id="input-edit-location"
                    value={editPlace}
                    onChange={(e) => setEditPlace(e.target.value)}
                    className={`w-full px-3 py-1.5 rounded-xl text-xs border outline-none ${
                      isDark
                        ? 'bg-slate-900 border-white/10 text-white'
                        : 'bg-white border-slate-300 text-slate-900'
                    }`}
                    placeholder="e.g. Patna"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                    Work / Occupation (Optional):
                  </label>
                  <input
                    type="text"
                    id="input-edit-work"
                    value={editWork}
                    onChange={(e) => setEditWork(e.target.value)}
                    className={`w-full px-3 py-1.5 rounded-xl text-xs border outline-none ${
                      isDark
                        ? 'bg-slate-900 border-white/10 text-white'
                        : 'bg-white border-slate-300 text-slate-900'
                    }`}
                    placeholder="e.g. Student"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                    Interests (Optional):
                  </label>
                  <input
                    type="text"
                    id="input-edit-interests"
                    value={editInterests}
                    onChange={(e) => setEditInterests(e.target.value)}
                    className={`w-full px-3 py-1.5 rounded-xl text-xs border outline-none ${
                      isDark
                        ? 'bg-slate-900 border-white/10 text-white'
                        : 'bg-white border-slate-300 text-slate-900'
                    }`}
                    placeholder="e.g. Technology, Cricket"
                  />
                </div>
                <div className="flex justify-between items-center pt-1">
                  <button
                    type="button"
                    onClick={handleResetLocalProfile}
                    className="text-xs text-rose-400 hover:text-rose-300 flex items-center space-x-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset Profile</span>
                  </button>
                  <div className="flex space-x-2">
                    <button
                      type="button"
                      onClick={() => setIsEditingProfile(false)}
                      className="px-3 py-1 rounded-lg text-xs font-semibold text-slate-400 hover:bg-white/5 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      id="btn-save-profile-edit"
                      onClick={handleSaveProfileEdit}
                      disabled={!editName.trim()}
                      className="px-3 py-1 rounded-lg text-xs font-semibold bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-white cursor-pointer"
                    >
                      Save Changes
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-2.5 pt-1">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 rounded-xl bg-black/20 border border-white/5 space-y-0.5">
                    <span className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider">
                      Name
                    </span>
                    <div className="font-semibold flex items-center space-x-1.5 truncate text-white">
                      <span>{localProfile?.name || 'Friend'}</span>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-black/20 border border-white/5 space-y-0.5">
                    <span className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider flex items-center space-x-1">
                      <MapPin className="w-2.5 h-2.5 text-rose-400" />
                      <span>Place</span>
                    </span>
                    <div className="font-semibold truncate text-slate-300">
                      {localProfile?.place || 'Not specified'}
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-black/20 border border-white/5 space-y-0.5">
                    <span className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider flex items-center space-x-1">
                      <Briefcase className="w-2.5 h-2.5 text-violet-400" />
                      <span>Work / Occupation</span>
                    </span>
                    <div className="font-semibold truncate text-slate-300">
                      {localProfile?.work || 'Not specified'}
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-black/20 border border-white/5 space-y-0.5">
                    <span className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider flex items-center space-x-1">
                      <Heart className="w-2.5 h-2.5 text-pink-400" />
                      <span>Interests</span>
                    </span>
                    <div className="font-semibold truncate text-slate-300">
                      {localProfile?.interests || 'Not specified'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    id="btn-reset-profile"
                    onClick={handleResetLocalProfile}
                    className="text-[11px] text-slate-400 hover:text-rose-400 flex items-center space-x-1 cursor-pointer transition-colors"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset Profile</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditName(localProfile?.name || '');
                      setEditPlace(localProfile?.place || '');
                      setEditWork(localProfile?.work || '');
                      setEditInterests(localProfile?.interests || '');
                      setIsEditingProfile(true);
                    }}
                    className="text-[11px] text-rose-400 hover:text-rose-300 font-semibold flex items-center space-x-1 cursor-pointer"
                  >
                    <Edit2 className="w-3 h-3" />
                    <span>Edit Profile</span>
                  </button>
                </div>
              </div>
            )}

            {/* Quick Test Voice Queries */}
            <div className="space-y-1.5 pt-1 border-t border-white/10">
              <span className="text-[11px] font-semibold text-rose-400 flex items-center space-x-1">
                <MessageSquare className="w-3 h-3" />
                <span>Test Profile Context:</span>
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  'What is my name?',
                  'Where do I live?',
                  'What do you know about me?',
                  'Suggest something I can learn',
                ].map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => handleQuickAsk(prompt)}
                    className={`text-left px-2.5 py-1.5 rounded-xl text-[11px] font-medium border transition-colors cursor-pointer truncate ${
                      isDark
                        ? 'bg-slate-800/60 border-white/5 text-slate-300 hover:bg-rose-500/20 hover:text-white hover:border-rose-500/30'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-300'
                    }`}
                    title={`Ask Tia: "${prompt}"`}
                  >
                    "{prompt}"
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Saved Facts & Memories */}
          <div
            className={`p-4 rounded-2xl border space-y-2 transition-all ${
              isDark
                ? 'bg-slate-800/40 border-white/10 text-slate-200'
                : 'bg-white border-slate-200 text-slate-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold flex items-center space-x-1">
                <span>Remembered Facts ({ownerProfile?.additional_memories?.length || 0})</span>
              </span>
                {onResetProfile && (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm('Reset owner profile back to initial Anurag defaults?')) {
                        onResetProfile();
                      }
                    }}
                    className="text-[10px] text-slate-400 hover:text-rose-400 flex items-center space-x-1 cursor-pointer"
                    title="Reset to default Anurag profile"
                  >
                    <RotateCcw className="w-2.5 h-2.5" />
                    <span>Reset Defaults</span>
                  </button>
                )}
              </div>

              {/* Memory List */}
              <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
                {ownerProfile?.additional_memories &&
                ownerProfile.additional_memories.length > 0 ? (
                  ownerProfile.additional_memories.map((mem) => (
                    <div
                      key={mem.id}
                      className={`flex items-center justify-between p-2 rounded-xl text-xs border ${
                        isDark
                          ? 'bg-slate-900/60 border-white/5 text-slate-300'
                          : 'bg-white border-slate-200 text-slate-700'
                      }`}
                    >
                      <span className="truncate pr-2">{mem.fact}</span>
                      {onDeleteMemory && (
                        <button
                          type="button"
                          onClick={() => onDeleteMemory(mem.id)}
                          className="text-slate-500 hover:text-red-400 p-1 rounded cursor-pointer shrink-0"
                          title="Delete this memory"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-[11px] text-slate-400 italic py-1">
                    No custom facts saved yet. Tell Tia "Remember that..." or add one below.
                  </p>
                )}
              </div>

              {/* Add Memory Form */}
              <form onSubmit={handleAddNewMemory} className="flex items-center space-x-1.5 pt-1">
                <input
                  type="text"
                  id="input-add-memory"
                  value={newMemoryInput}
                  onChange={(e) => setNewMemoryInput(e.target.value)}
                  placeholder="e.g. Anurag likes black coffee..."
                  className={`flex-1 px-3 py-1.5 rounded-xl text-xs border outline-none ${
                    isDark
                      ? 'bg-slate-900 border-white/10 text-white placeholder-slate-500'
                      : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
                  }`}
                />
                <button
                  type="submit"
                  disabled={!newMemoryInput.trim()}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-rose-500 hover:bg-rose-600 disabled:opacity-40 text-white flex items-center space-x-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Remember</span>
                </button>
              </form>
            </div>

          {/* 1. Hands-Free "Hey Tia" Wake Word Toggle */}
          <div className="flex items-center justify-between p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20">
            <div className="space-y-0.5">
              <label
                htmlFor="setting-handsfree-toggle"
                className="font-bold text-sm flex items-center space-x-1.5 text-rose-400"
              >
                <Zap className="w-4 h-4" />
                <span>Hands-Free "Hey Tia" Wake Word</span>
              </label>
              <p className="text-xs text-slate-400">
                Wake Tia hands-free by saying "Hey Tia" without touching your device
              </p>
            </div>
            <button
              type="button"
              id="setting-handsfree-toggle"
              onClick={() =>
                onUpdateSettings({ handsFreeMode: !settings.handsFreeMode })
              }
              role="switch"
              aria-checked={settings.handsFreeMode}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                settings.handsFreeMode ? 'bg-rose-500' : 'bg-slate-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                  settings.handsFreeMode ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* 2. Follow-Up Listening Window (if hands-free enabled) */}
          {settings.handsFreeMode && (
            <div className="space-y-2 p-3 rounded-2xl bg-slate-800/40 border border-white/5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="setting-followup-slider"
                  className="font-semibold text-xs text-slate-200 flex items-center space-x-1"
                >
                  <span>Follow-Up Listening Window</span>
                </label>
                <span className="text-xs font-mono font-bold text-cyan-400">
                  {settings.followUpTimeoutSeconds} seconds
                </span>
              </div>
              <input
                type="range"
                id="setting-followup-slider"
                min="3"
                max="5"
                step="1"
                value={settings.followUpTimeoutSeconds}
                onChange={(e) =>
                  onUpdateSettings({
                    followUpTimeoutSeconds: parseInt(e.target.value, 10),
                  })
                }
                className="w-full accent-cyan-400 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>3s (Snappy)</span>
                <span>4s (Recommended)</span>
                <span>5s (Relaxed)</span>
              </div>
              <p className="text-[11px] text-slate-400">
                After Tia finishes speaking, she stays in listening mode so you can reply naturally without tapping.
              </p>
            </div>
          )}

          {/* 3. Audio Wake Chime Toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <label
                htmlFor="setting-chime-toggle"
                className="font-semibold text-sm flex items-center space-x-1.5"
              >
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>Audio Wake Chime</span>
              </label>
              <p className="text-xs text-slate-400">
                Play a subtle confirmation tone when "Hey Tia" is detected
              </p>
            </div>
            <button
              type="button"
              id="setting-chime-toggle"
              onClick={() =>
                onUpdateSettings({ wakeChimeEnabled: !settings.wakeChimeEnabled })
              }
              role="switch"
              aria-checked={settings.wakeChimeEnabled}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                settings.wakeChimeEnabled ? 'bg-amber-500' : 'bg-slate-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                  settings.wakeChimeEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* 4. Tia Voice Output Toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <label
                htmlFor="setting-voice-toggle"
                className="font-semibold text-sm flex items-center space-x-1.5"
              >
                {settings.voiceEnabled ? (
                  <Volume2 className="w-4 h-4 text-rose-400" />
                ) : (
                  <VolumeX className="w-4 h-4 text-slate-400" />
                )}
                <span>Tia Voice Output</span>
              </label>
              <p className="text-xs text-slate-400">
                Tia speaks answers aloud using natural voice
              </p>
            </div>
            <button
              type="button"
              id="setting-voice-toggle"
              onClick={() =>
                onUpdateSettings({ voiceEnabled: !settings.voiceEnabled })
              }
              role="switch"
              aria-checked={settings.voiceEnabled}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                settings.voiceEnabled ? 'bg-rose-500' : 'bg-slate-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                  settings.voiceEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* 5. Automatic Contextual Voice Selection Toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <label
                htmlFor="setting-autovoice-toggle"
                className="font-semibold text-sm flex items-center space-x-1.5"
              >
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>Auto Voice Selection</span>
              </label>
              <p className="text-xs text-slate-400">
                Automatically adapts voice to emotion, language, and context
              </p>
            </div>
            <button
              type="button"
              id="setting-autovoice-toggle"
              onClick={() =>
                onUpdateSettings({ autoVoiceSelection: !settings.autoVoiceSelection })
              }
              role="switch"
              aria-checked={settings.autoVoiceSelection}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                settings.autoVoiceSelection ? 'bg-amber-500' : 'bg-slate-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                  settings.autoVoiceSelection ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Voice Engine & Quality Provider */}
          <div className="space-y-3 p-3.5 rounded-2xl border border-white/10 bg-slate-800/40">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="font-semibold text-sm flex items-center space-x-1.5 text-white">
                  <Sparkles className="w-4 h-4 text-rose-400" />
                  <span>Voice Engine & Provider</span>
                </span>
                <p className="text-xs text-slate-400">
                  Select default browser synthesis or studio-grade premium cloud voice.
                </p>
              </div>
            </div>

            {/* Provider Toggle Buttons */}
            <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-900/60 border border-white/5">
              <button
                type="button"
                onClick={() => onUpdateSettings({ ttsEngine: 'browser', ttsProvider: 'browser' })}
                className={`py-2 px-3 rounded-lg text-xs font-medium flex items-center justify-center space-x-1.5 transition-all ${
                  settings.ttsEngine !== 'premium'
                    ? 'bg-rose-500 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <span>Browser Voice</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/20">0ms • Free</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  onUpdateSettings({
                    ttsEngine: 'premium',
                    ttsProvider: settings.premiumVoiceId?.includes('Chirp') ? 'google-cloud' : 'gemini',
                  })
                }
                className={`py-2 px-3 rounded-lg text-xs font-medium flex items-center justify-center space-x-1.5 transition-all ${
                  settings.ttsEngine === 'premium'
                    ? 'bg-rose-500 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <span>✨ Premium Studio</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/20">HD Voices</span>
              </button>
            </div>

            {/* Premium Voice Persona Options */}
            {settings.ttsEngine === 'premium' ? (
              <div className="space-y-2.5 pt-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-slate-300">
                    Studio Voice Persona
                  </label>
                  {ttsLiveStatus?.state === 'premium-ready' && (
                    <span className="text-[10px] text-emerald-400 font-medium flex items-center space-x-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span>Premium Ready (Live)</span>
                    </span>
                  )}
                  {ttsLiveStatus?.state === 'browser-fallback' && (
                    <span className="text-[10px] text-amber-400 font-medium flex items-center space-x-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                      <span>Browser Fallback (Quota 429)</span>
                    </span>
                  )}
                  {ttsLiveStatus?.state === 'config-required' && (
                    <span className="text-[10px] text-rose-400 font-medium flex items-center space-x-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                      <span>Configuration Required</span>
                    </span>
                  )}
                  {!ttsLiveStatus && (
                    <span className="text-[10px] text-emerald-400 font-medium flex items-center space-x-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span>Auto Fallback Active</span>
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateSettings({
                        premiumVoiceId: 'Aoede',
                        ttsEngine: 'premium',
                        ttsProvider: 'gemini',
                      })
                    }
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      (settings.premiumVoiceId || 'Aoede') === 'Aoede'
                        ? 'border-rose-500 bg-rose-500/10 text-white'
                        : 'border-white/5 bg-slate-800/60 text-slate-400 hover:border-white/10'
                    }`}
                  >
                    <div className="font-semibold text-xs text-rose-300 flex items-center justify-between">
                      <span>Aoede (Gemini)</span>
                      <span className="text-[10px] bg-rose-500/20 px-1 rounded text-rose-300">Recommended</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Warm, expressive young female tone. Fluent conversational Hinglish.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      onUpdateSettings({
                        premiumVoiceId: 'Kore',
                        ttsEngine: 'premium',
                        ttsProvider: 'gemini',
                      })
                    }
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      settings.premiumVoiceId === 'Kore'
                        ? 'border-rose-500 bg-rose-500/10 text-white'
                        : 'border-white/5 bg-slate-800/60 text-slate-400 hover:border-white/10'
                    }`}
                  >
                    <div className="font-semibold text-xs text-rose-300 flex items-center justify-between">
                      <span>Kore (Gemini)</span>
                      <span className="text-[10px] bg-indigo-500/20 px-1 rounded text-indigo-300">Articulate</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Bright, crisp, friendly female tone. Great clarity on English words.
                    </p>
                  </button>
                </div>

                {/* Google Cloud Chirp 3 HD Option */}
                <button
                  type="button"
                  onClick={() =>
                    onUpdateSettings({
                      premiumVoiceId: 'hi-IN-Chirp3-HD-Aoede',
                      ttsEngine: 'premium',
                      ttsProvider: 'google-cloud',
                    })
                  }
                  className={`w-full p-2.5 rounded-xl border text-left transition-all ${
                    settings.premiumVoiceId?.includes('Chirp')
                      ? 'border-cyan-500 bg-cyan-500/10 text-white'
                      : 'border-white/5 bg-slate-800/60 text-slate-400 hover:border-white/10'
                  }`}
                >
                  <div className="font-semibold text-xs text-cyan-300 flex items-center justify-between">
                    <span>Google Cloud Chirp 3 HD (Hindi)</span>
                    <span className="text-[10px] bg-cyan-500/20 px-1.5 py-0.5 rounded text-cyan-300">Cloud API</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Studio-grade Chirp 3 HD voice. Requires GOOGLE_CLOUD_TTS_API_KEY in server environment.
                  </p>
                </button>

                {/* Truthful Status Banner */}
                {ttsLiveStatus?.state === 'premium-ready' && (
                  <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-300 flex items-start space-x-2">
                    <CheckCircle className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
                    <p>
                      <span className="font-semibold">Premium Ready:</span> Live studio voice synthesis is active. Normal Tia responses are generated using cloud AI speech ({settings.premiumVoiceId || 'Aoede'}).
                    </p>
                  </div>
                )}

                {ttsLiveStatus?.state === 'browser-fallback' && (
                  <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300 flex items-start space-x-2">
                    <Info className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                    <p>
                      <span className="font-semibold">{ttsLiveStatus.label || 'Browser Fallback'}:</span> {ttsLiveStatus.details || 'Gemini daily free-tier quota (10 requests/day) is temporarily reached (HTTP 429). Tia is speaking safely with device browser voice until quota resets.'}
                    </p>
                  </div>
                )}

                {ttsLiveStatus?.state === 'config-required' && (
                  <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-[11px] text-rose-300 flex items-start space-x-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                    <p>
                      <span className="font-semibold">Configuration Required:</span> {ttsLiveStatus.details || 'Google Cloud Chirp 3 HD requires GOOGLE_CLOUD_TTS_API_KEY on the server. Tia will speak via browser voice until configured.'}
                    </p>
                  </div>
                )}

                {!ttsLiveStatus && (
                  <div className="p-2.5 rounded-xl bg-slate-900/60 border border-white/5 text-[11px] text-slate-300 flex items-start space-x-2">
                    <Info className="w-4 h-4 shrink-0 mt-0.5 text-slate-400" />
                    <p>
                      <span className="font-semibold">Safe Failover Guarantee:</span> If rate limits or timeouts happen, Tia automatically continues speaking via device browser voice with zero delay.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-[11px] text-slate-400">
                Active: Local device browser voice (Google Hindi / Microsoft Swara) with context-aware Hinglish pronunciation normalizer.
              </p>
            )}

            {/* Pronunciation & Voice Evaluation Benchmark Test Suite */}
            <div className="pt-2.5 border-t border-white/5 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-slate-300">
                    Benchmark Reference Audio (Pre-rendered)
                  </span>
                  <p className="text-[10px] text-slate-400">
                    Pre-rendered studio recordings illustrating pronunciation quality (does not call live API)
                  </p>
                </div>
                <span className="text-[10px] text-slate-400 shrink-0">
                  Click to listen
                </span>
              </div>
              <div className="space-y-1.5">
                {TEST_SAMPLE_SENTENCES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handlePlaySample(item.id)}
                    className={`w-full text-left p-2 rounded-xl border flex items-center justify-between text-xs transition-all ${
                      playingSampleId === item.id
                        ? 'bg-rose-500/20 border-rose-500/40 text-white'
                        : 'bg-slate-900/40 hover:bg-slate-900/70 border-white/5 text-slate-300'
                    }`}
                  >
                    <div className="pr-2 truncate">
                      <div className="font-medium text-slate-200">
                        {item.label}: <span className="text-slate-300 italic font-normal">"{item.text}"</span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        Target: {item.target}
                      </div>
                    </div>
                    <div className="shrink-0 flex items-center space-x-1.5 text-rose-400 pl-2">
                      {playingSampleId === item.id ? (
                        <span className="flex items-center space-x-1 text-xs text-rose-300">
                          <Square className="w-3.5 h-3.5 fill-current" />
                          <span>Stop</span>
                        </span>
                      ) : (
                        <span className="flex items-center space-x-1 text-xs text-rose-400">
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>Play</span>
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 3. Voice Speed & Test Voice */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label
                htmlFor="setting-speed-slider"
                className="font-semibold text-sm"
              >
                Voice Speed ({settings.speechRate.toFixed(2)}x)
              </label>
              <button
                type="button"
                id="btn-test-voice"
                onClick={onTestVoice}
                className="text-xs flex items-center space-x-1 text-rose-400 hover:text-rose-300 px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 cursor-pointer transition-colors"
              >
                <Play className="w-3 h-3" />
                <span>Test Voice Sample</span>
              </button>
            </div>
            <input
              type="range"
              id="setting-speed-slider"
              min="0.8"
              max="1.3"
              step="0.05"
              value={settings.speechRate}
              onChange={(e) =>
                onUpdateSettings({ speechRate: parseFloat(e.target.value) })
              }
              className="w-full accent-rose-500 cursor-pointer"
            />
            <div className="flex justify-between text-[11px] text-slate-400">
              <span>Slower (0.8x)</span>
              <span>Conversational (1.0x)</span>
              <span>Brisk (1.3x)</span>
            </div>
          </div>

          {/* 4. Voice Persona Selection (Manual override or Auto indicator) */}
          {availableVoices.length > 0 && (
            <div className="space-y-1.5">
              <label
                htmlFor="setting-voice-select"
                className="font-semibold text-sm flex items-center justify-between"
              >
                <span>Voice Persona</span>
                {settings.autoVoiceSelection && (
                  <span className="text-[10px] text-amber-400 font-normal">
                    (Auto mode active)
                  </span>
                )}
              </label>
              <select
                id="setting-voice-select"
                value={settings.selectedVoiceURI}
                onChange={(e) => {
                  const val = e.target.value;
                  onUpdateSettings({
                    selectedVoiceURI: val,
                    autoVoiceSelection: val === '', // If user picks specific voice, lock to it
                  });
                }}
                className={`w-full px-3 py-2 rounded-xl text-xs border focus:outline-none focus:ring-2 focus:ring-rose-500 ${
                  isDark
                    ? 'bg-slate-800 border-white/10 text-white'
                    : 'bg-slate-50 border-slate-300 text-slate-800'
                }`}
              >
                <option value="">✨ Auto Match (Best Indian Voice per context)</option>
                {availableVoices.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>
                    {v.name} ({v.lang}) {v.isIndian ? '🇮🇳 [Indian]' : ''}{' '}
                    {v.isFemale ? '♀' : v.isMale ? '♂' : ''}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-400">
                {settings.autoVoiceSelection
                  ? 'Tia dynamically chooses between Hindi, Hinglish, and Indian English voices based on your questions.'
                  : 'Voice manually locked to this selection.'}
              </p>
            </div>
          )}

          {/* 5. Language Preference */}
          <div className="space-y-2">
            <label className="font-semibold text-sm flex items-center space-x-1.5">
              <Languages className="w-4 h-4 text-violet-400" />
              <span>Language Preference</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { id: 'auto', label: 'Auto (Match my speech)' },
                  { id: 'hinglish', label: 'Hinglish (Hindi in Roman)' },
                  { id: 'hindi', label: 'Hindi (हिंदी)' },
                  { id: 'english', label: 'English (Indian)' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  id={`lang-pref-${opt.id}`}
                  onClick={() =>
                    onUpdateSettings({ languagePreference: opt.id })
                  }
                  className={`px-3 py-2 rounded-xl text-xs font-medium text-left border transition-all cursor-pointer ${
                    settings.languagePreference === opt.id
                      ? 'bg-rose-500/20 border-rose-500 text-rose-400 font-semibold'
                      : isDark
                      ? 'bg-slate-800/50 border-white/5 text-slate-300 hover:bg-slate-800'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* 6. Funny Personality Toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <label
                htmlFor="setting-funny-toggle"
                className="font-semibold text-sm flex items-center space-x-1.5"
              >
                <Smile className="w-4 h-4 text-amber-400" />
                <span>Funny Indian Friend Vibe</span>
              </label>
              <p className="text-xs text-slate-400">
                Witty banter, playful teasing, and relatable humor
              </p>
            </div>
            <button
              type="button"
              id="setting-funny-toggle"
              onClick={() =>
                onUpdateSettings({ funnyMode: !settings.funnyMode })
              }
              role="switch"
              aria-checked={settings.funnyMode}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                settings.funnyMode ? 'bg-amber-500' : 'bg-slate-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                  settings.funnyMode ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* 7. Clear Conversation Memory */}
          <div className="pt-2 border-t border-white/10 flex items-center justify-between">
            <div>
              <p className="font-semibold text-sm">Clear Session</p>
              <p className="text-xs text-slate-400">
                Reset Tia's short-term memory
              </p>
            </div>
            <button
              type="button"
              id="btn-clear-conversation"
              onClick={handleClear}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 transition-colors cursor-pointer"
            >
              {clearedConfirm ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Cleared!</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear Memory</span>
                </>
              )}
            </button>
          </div>

          {/* 8. About Tia & Voice Technology */}
          <div className="pt-2 border-t border-white/10">
            <button
              type="button"
              id="btn-toggle-about"
              onClick={() => setShowAbout(!showAbout)}
              className="w-full flex items-center justify-between py-2 text-xs font-medium text-slate-400 hover:text-slate-200 cursor-pointer"
            >
              <span className="flex items-center space-x-1.5">
                <Info className="w-4 h-4 text-rose-400" />
                <span className="font-semibold text-sm">Voice Technology & Emotion System</span>
              </span>
              <span>{showAbout ? 'Hide' : 'Show Details'}</span>
            </button>

            {showAbout && (
              <div
                id="about-tia-content"
                className={`mt-2 p-3.5 rounded-2xl text-xs space-y-2.5 leading-relaxed border ${
                  isDark
                    ? 'bg-slate-800/60 border-white/5 text-slate-300'
                    : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}
              >
                <div>
                  <span className="font-semibold text-rose-400">Platform & Hands-Free Wake Word Architecture:</span>{' '}
                  Tia is a Progressive Web App (PWA). While the app is open in your browser or installed on your home screen, Tia listens continuously for "Hey Tia" using on-device Web Speech recognition and audio cues. Because web browsers pause microphone access when the screen is locked or another app is opened for OS security, true background wake-word spotting (like Google Assistant) requires a native Android app with foreground audio service permissions. In this web app, Tia provides full hands-free conversation and automatic follow-up listening whenever Tia is open!
                </div>
                <div>
                  <span className="font-semibold text-cyan-400">Follow-Up Listening (3-5s):</span>{' '}
                  After Tia answers a question aloud, she remains in follow-up listening mode for 3–5 seconds so you can ask "Aur India ka GDP?", "Why?", or follow-ups without pressing any buttons.
                </div>
                <div>
                  <span className="font-semibold text-amber-400">Natural Voice Prosody:</span>{' '}
                  Tia dynamically calculates speech pitch curves, rates, and breathing pauses for 10 emotional states (Playful, Witty, Excited, Calm, Serious, Empathetic, etc.). Sentences with questions receive natural interrogative rising pitch.
                </div>
                <div>
                  <span className="font-semibold text-amber-400">Acronym Enunciation:</span>{' '}
                  Acronyms like "GDP", "UPI", "RBI", "IPL", and "AI" are phonetically spaced so device TTS reads them letter-by-letter rather than garbling them. Currency symbols (₹500) are cleanly pronounced as "500 rupees".
                </div>
                <div>
                  <span className="font-semibold text-violet-400">
                    Device TTS vs Cloud:
                  </span>{' '}
                  Tia currently runs on the device's Web Speech API (`SpeechSynthesis`). This ensures 100% zero-latency, private, offline-capable playback with zero paid API costs. Google TTS on Android provides neural Indian voices (Google हिन्दी and Google English India).
                </div>
                <div>
                  <span className="font-semibold text-emerald-400">
                    Mobile Android Setup:
                  </span>{' '}
                  Open in Chrome on your Android phone → Tap menu (⋮) → "Add to Home screen"
                  to install Tia as a full-screen voice assistant. Ensure Google Speech Services are updated in Android Settings → Accessibility → Text-to-speech output.
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-white/10 flex items-center justify-end">
          <button
            type="button"
            id="btn-done-settings"
            onClick={onClose}
            className="px-5 py-2 rounded-full bg-rose-500 hover:bg-rose-600 text-white text-xs font-semibold transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
