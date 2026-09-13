import React from 'react';
import { Volume2, VolumeX, Moon, Sun, Settings, Sparkles, UserCheck, LogOut, Languages } from 'lucide-react';
import type { TiaSettings, OwnerProfile } from '../types';

interface HeaderProps {
  settings: TiaSettings;
  onUpdateSettings: (updater: Partial<TiaSettings>) => void;
  onOpenSettings: () => void;
  isDark: boolean;
  ownerProfile?: OwnerProfile | null;
  onLogout?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  settings,
  onUpdateSettings,
  onOpenSettings,
  isDark,
  ownerProfile,
  onLogout,
}) => {
  return (
    <header
      id="app-header"
      className="w-full max-w-xl mx-auto px-4 pt-3 pb-2 flex items-center justify-between z-20"
    >
      {/* Left: Brand info */}
      <div className="flex items-center space-x-2.5">
        <div className="relative flex items-center justify-center w-9 h-9 rounded-full bg-gradient-to-tr from-rose-500 to-violet-600 shadow-md shadow-rose-500/20">
          <Sparkles className="w-4 h-4 text-white" />
          <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-400 border-2 border-[#0b0f19] rounded-full" />
        </div>
        <div>
          <div className="flex items-center space-x-1.5">
            <h1
              id="brand-name"
              className={`font-bold tracking-tight text-lg leading-tight font-display ${
                isDark ? 'text-white' : 'text-slate-900'
              }`}
            >
              Tia
            </h1>
            <button
              type="button"
              id="btn-toggle-hands-free"
              onClick={() =>
                onUpdateSettings({ handsFreeMode: !settings.handsFreeMode })
              }
              title={
                settings.handsFreeMode
                  ? 'Hands-Free "Hey Tia" active. Click to disable.'
                  : 'Hands-Free inactive. Click to enable "Hey Tia".'
              }
              className={`text-[10px] font-semibold tracking-wider px-2 py-0.5 rounded-full border flex items-center space-x-1 cursor-pointer transition-all ${
                settings.handsFreeMode
                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25'
                  : 'bg-slate-500/15 text-slate-400 border-slate-500/30 hover:bg-slate-500/25'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  settings.handsFreeMode ? 'bg-emerald-400 animate-pulse' : 'bg-slate-400'
                }`}
              />
              <span>{settings.handsFreeMode ? 'Hey Tia' : 'Manual Mic'}</span>
            </button>

            {/* Owner Profile Badge */}
            <button
              type="button"
              id="btn-header-owner-badge"
              onClick={onOpenSettings}
              title={`Owner: ${ownerProfile?.name || 'Owner'} (${ownerProfile?.location || 'India'}) - Click to view Profile & Memory`}
              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border flex items-center space-x-1 cursor-pointer transition-all ${
                isDark
                  ? 'bg-rose-500/15 text-rose-300 border-rose-500/30 hover:bg-rose-500/25'
                  : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
              }`}
            >
              <UserCheck className="w-3 h-3 text-rose-400" />
              <span>{ownerProfile?.name || 'Owner'}</span>
            </button>
          </div>
          <div className="flex items-center space-x-1.5 mt-0.5">
            <span className="text-[11px] text-slate-400 leading-none">
              {settings.funnyMode ? 'Witty & Smart' : 'Helpful & Direct'}
            </span>
            <span className="text-[10px] text-slate-500">•</span>
            <button
              type="button"
              id="btn-header-language-toggle"
              onClick={() => {
                const order: Array<TiaSettings['languagePreference']> = ['auto', 'hinglish', 'hindi', 'english'];
                const nextIdx = (order.indexOf(settings.languagePreference) + 1) % order.length;
                onUpdateSettings({ languagePreference: order[nextIdx] });
              }}
              title={`Voice Speech Language: ${settings.languagePreference.toUpperCase()} (Click to toggle)`}
              className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex items-center space-x-1 cursor-pointer transition-colors ${
                isDark
                  ? 'bg-white/10 hover:bg-white/20 text-slate-300 border border-white/10'
                  : 'bg-slate-200 hover:bg-slate-300 text-slate-700 border border-slate-300'
              }`}
            >
              <Languages className="w-2.5 h-2.5 opacity-70" />
              <span>{settings.languagePreference === 'auto' ? 'AUTO' : settings.languagePreference.toUpperCase()}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Right: Quick action controls */}
      <div className="flex items-center space-x-1.5">
        {/* Voice Toggle */}
        <button
          type="button"
          id="btn-voice-toggle"
          onClick={() => onUpdateSettings({ voiceEnabled: !settings.voiceEnabled })}
          className={`p-2 rounded-full transition-colors cursor-pointer ${
            settings.voiceEnabled
              ? isDark
                ? 'text-rose-400 hover:bg-white/10'
                : 'text-rose-600 hover:bg-slate-200'
              : 'text-slate-500 hover:bg-white/5'
          }`}
          title={settings.voiceEnabled ? 'Voice output enabled' : 'Voice output muted'}
          aria-label={settings.voiceEnabled ? 'Mute voice' : 'Unmute voice'}
        >
          {settings.voiceEnabled ? (
            <Volume2 className="w-5 h-5" />
          ) : (
            <VolumeX className="w-5 h-5" />
          )}
        </button>

        {/* Theme Toggle */}
        <button
          type="button"
          id="btn-theme-toggle"
          onClick={() =>
            onUpdateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' })
          }
          className={`p-2 rounded-full transition-colors cursor-pointer ${
            isDark ? 'text-slate-300 hover:bg-white/10' : 'text-slate-700 hover:bg-slate-200'
          }`}
          title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          aria-label="Toggle theme"
        >
          {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>

        {/* Settings button */}
        <button
          type="button"
          id="btn-settings"
          onClick={onOpenSettings}
          className={`p-2 rounded-full transition-colors cursor-pointer ${
            isDark ? 'text-slate-300 hover:bg-white/10' : 'text-slate-700 hover:bg-slate-200'
          }`}
          title="Tia Settings & Profile"
          aria-label="Open settings"
        >
          <Settings className="w-5 h-5" />
        </button>

        {/* Logout button */}
        {onLogout && (
          <button
            type="button"
            id="btn-header-logout"
            onClick={onLogout}
            className={`p-2 rounded-full transition-colors cursor-pointer ${
              isDark ? 'text-slate-400 hover:text-rose-400 hover:bg-rose-500/10' : 'text-slate-600 hover:text-rose-600 hover:bg-rose-50'
            }`}
            title="Log Out of Tia"
            aria-label="Log Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        )}
      </div>
    </header>
  );
};
