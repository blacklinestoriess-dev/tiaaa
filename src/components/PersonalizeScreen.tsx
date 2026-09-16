import React, { useState } from 'react';
import type { TiaLocalProfile } from '../types';
import { Sparkles, Shield, MapPin, Briefcase, Heart, ArrowRight } from 'lucide-react';

interface PersonalizeScreenProps {
  isDark: boolean;
  onContinue: (profile: TiaLocalProfile) => void;
}

export const PersonalizeScreen: React.FC<PersonalizeScreenProps> = ({ isDark, onContinue }) => {
  const [name, setName] = useState('');
  const [place, setPlace] = useState('');
  const [work, setWork] = useState('');
  const [interests, setInterests] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Please enter your name to continue.');
      return;
    }

    const newProfile: TiaLocalProfile = {
      name: trimmedName,
      place: place.trim() || undefined,
      work: work.trim() || undefined,
      interests: interests.trim() || undefined,
    };

    onContinue(newProfile);
  };

  return (
    <div
      id="personalize-screen"
      className={`min-h-screen w-full flex items-center justify-center p-4 transition-colors duration-200 relative overflow-hidden ${
        isDark ? 'bg-[#0b0f19] text-slate-100' : 'bg-slate-50 text-slate-900'
      }`}
    >
      {/* Background ambient lighting */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />

      <div
        id="personalize-card"
        className={`w-full max-w-md rounded-3xl p-6 sm:p-8 border shadow-2xl relative z-10 backdrop-blur-md transition-all ${
          isDark
            ? 'bg-slate-900/80 border-white/10 text-slate-100 shadow-rose-950/20'
            : 'bg-white/95 border-slate-200/90 text-slate-900 shadow-slate-200/60'
        }`}
      >
        {/* Header Branding */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="relative flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-rose-500 to-violet-600 shadow-lg shadow-rose-500/25 mb-4 animate-bounce-subtle">
            <Sparkles className="w-7 h-7 text-white" />
            <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-400 border-2 border-[#0b0f19] rounded-full" />
          </div>

          <h1
            id="personalize-title"
            className="text-2xl font-bold tracking-tight font-display bg-gradient-to-r from-rose-400 via-pink-400 to-violet-400 bg-clip-text text-transparent"
          >
            Personalize Tia
          </h1>
          <p className="text-sm text-slate-400 mt-1 max-w-xs leading-relaxed">
            Tell Tia what to call you and a few details to tailor conversations. Stored locally on this device.
          </p>
        </div>

        {/* Error message */}
        {error && (
          <div
            id="personalize-error"
            className="mb-4 p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-medium text-center"
          >
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name Field (REQUIRED) */}
          <div className="space-y-1.5">
            <label
              htmlFor="input-personalize-name"
              className="block text-xs font-semibold tracking-wide uppercase text-slate-400"
            >
              Name <span className="text-rose-400 font-bold">*</span>
            </label>
            <input
              type="text"
              id="input-personalize-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(null);
              }}
              placeholder="e.g. Rahul"
              autoFocus
              className={`w-full px-4 py-3 rounded-2xl text-sm border outline-none transition-all ${
                isDark
                  ? 'bg-slate-800/80 border-white/10 text-white placeholder-slate-500 focus:border-rose-500/60 focus:bg-slate-800'
                  : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400 focus:border-rose-500/60 focus:bg-white'
              }`}
            />
          </div>

          {/* Place Field (OPTIONAL) */}
          <div className="space-y-1.5">
            <label
              htmlFor="input-personalize-place"
              className="block text-xs font-semibold tracking-wide uppercase text-slate-400 flex items-center space-x-1"
            >
              <MapPin className="w-3 h-3 text-rose-400" />
              <span>Place (Optional)</span>
            </label>
            <input
              type="text"
              id="input-personalize-place"
              value={place}
              onChange={(e) => setPlace(e.target.value)}
              placeholder="e.g. Patna"
              className={`w-full px-4 py-2.5 rounded-2xl text-sm border outline-none transition-all ${
                isDark
                  ? 'bg-slate-800/80 border-white/10 text-white placeholder-slate-500 focus:border-rose-500/60 focus:bg-slate-800'
                  : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400 focus:border-rose-500/60 focus:bg-white'
              }`}
            />
          </div>

          {/* Work / Occupation Field (OPTIONAL) */}
          <div className="space-y-1.5">
            <label
              htmlFor="input-personalize-work"
              className="block text-xs font-semibold tracking-wide uppercase text-slate-400 flex items-center space-x-1"
            >
              <Briefcase className="w-3 h-3 text-violet-400" />
              <span>Work / Occupation (Optional)</span>
            </label>
            <input
              type="text"
              id="input-personalize-work"
              value={work}
              onChange={(e) => setWork(e.target.value)}
              placeholder="e.g. Student, Software Developer"
              className={`w-full px-4 py-2.5 rounded-2xl text-sm border outline-none transition-all ${
                isDark
                  ? 'bg-slate-800/80 border-white/10 text-white placeholder-slate-500 focus:border-rose-500/60 focus:bg-slate-800'
                  : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400 focus:border-rose-500/60 focus:bg-white'
              }`}
            />
          </div>

          {/* Interests Field (OPTIONAL) */}
          <div className="space-y-1.5">
            <label
              htmlFor="input-personalize-interests"
              className="block text-xs font-semibold tracking-wide uppercase text-slate-400 flex items-center space-x-1"
            >
              <Heart className="w-3 h-3 text-pink-400" />
              <span>Interests (Optional)</span>
            </label>
            <input
              type="text"
              id="input-personalize-interests"
              value={interests}
              onChange={(e) => setInterests(e.target.value)}
              placeholder="e.g. Technology, Cricket, Music"
              className={`w-full px-4 py-2.5 rounded-2xl text-sm border outline-none transition-all ${
                isDark
                  ? 'bg-slate-800/80 border-white/10 text-white placeholder-slate-500 focus:border-rose-500/60 focus:bg-slate-800'
                  : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400 focus:border-rose-500/60 focus:bg-white'
              }`}
            />
          </div>

          {/* Privacy Notice */}
          <div className="flex items-center space-x-2 py-2 px-3 rounded-xl bg-slate-500/10 border border-slate-500/15 text-[11px] text-slate-400">
            <Shield className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>Stored only in this browser's localStorage. No server or cloud database used.</span>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            id="btn-personalize-continue"
            disabled={!name.trim()}
            className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-rose-500 to-violet-600 hover:from-rose-600 hover:to-violet-700 text-white font-semibold text-sm shadow-lg shadow-rose-500/25 flex items-center justify-center space-x-2 cursor-pointer transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span>Continue</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
