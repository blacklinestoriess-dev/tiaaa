import React, { useState } from 'react';
import {
  Activity,
  Mic,
  Volume2,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Zap,
} from 'lucide-react';
import type { VoiceState } from '../types';

export interface WakeWordDebugInfo {
  wakeWordActive: boolean;
  micPermission: 'granted' | 'denied' | 'prompt' | 'unsupported';
  micReady: boolean;
  speechRecReady: boolean;
  isListening: boolean;
  recognizerStatus: string;
  lastRecognizedSpeech: string;
  lastRecognizedTimestamp: string;
  lastWakeDetected: string | null;
  activeLangCode: string;
  // Diagnostic fields for each new result
  lastRawResult?: string;
  lastMatchedAlias?: string;
  lastAlternatives?: string[];
  wakeTriggered?: boolean;
  // Voice feedback loop diagnostics
  currentVoiceState?: VoiceState;
  isTtsSpeaking?: boolean;
  aiRequestSource?: 'USER' | 'NONE';
}

interface WakeWordDebugIndicatorProps {
  debugInfo: WakeWordDebugInfo;
  onTestWakeWord: (phrase: string) => void;
  onRestartListener: () => void;
  onRequestMic: () => void;
  isDark: boolean;
}

export const WakeWordDebugIndicator: React.FC<WakeWordDebugIndicatorProps> = ({
  debugInfo,
  onTestWakeWord,
  onRestartListener,
  onRequestMic,
  isDark,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const getStatusColor = (status: string) => {
    if (status.includes('listening') || status.includes('wake_active')) {
      return 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30';
    }
    if (status.includes('starting') || status.includes('restarting')) {
      return 'text-amber-400 bg-amber-500/15 border-amber-500/30';
    }
    if (status.includes('error') || status.includes('denied')) {
      return 'text-rose-400 bg-rose-500/15 border-rose-500/30';
    }
    return 'text-slate-400 bg-slate-500/15 border-slate-500/30';
  };

  const getMicBadgeColor = (perm: string) => {
    switch (perm) {
      case 'granted':
        return 'text-emerald-400 bg-emerald-500/20';
      case 'prompt':
        return 'text-amber-400 bg-amber-500/20 animate-pulse';
      case 'denied':
        return 'text-rose-400 bg-rose-500/20';
      default:
        return 'text-slate-400 bg-slate-500/20';
    }
  };

  return (
    <div
      id="wake-word-debug-panel"
      className={`fixed top-16 right-3 z-40 max-w-sm w-full transition-all duration-200 text-xs font-mono shadow-2xl rounded-2xl border backdrop-blur-xl ${
        isDark
          ? 'bg-slate-950/92 border-emerald-500/30 text-slate-200'
          : 'bg-white/95 border-emerald-500/40 text-slate-800'
      }`}
    >
      {/* Top Header / Collapsed Pill Bar */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="px-3.5 py-2 flex items-center justify-between cursor-pointer select-none rounded-t-2xl hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center space-x-2">
          <span className="relative flex h-2 w-2">
            <span
              className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                debugInfo.wakeWordActive ? 'bg-emerald-400' : 'bg-amber-400'
              }`}
            />
            <span
              className={`relative inline-flex rounded-full h-2 w-2 ${
                debugInfo.wakeWordActive ? 'bg-emerald-500' : 'bg-slate-500'
              }`}
            />
          </span>
          <span className="font-bold text-[11px] tracking-tight text-emerald-400 flex items-center space-x-1">
            <Activity className="w-3.5 h-3.5 mr-0.5" />
            <span>Wake-Word Debug</span>
          </span>
          <span
            className={`px-1.5 py-0.2 rounded text-[10px] font-semibold uppercase ${
              debugInfo.wakeWordActive
                ? 'bg-emerald-500/20 text-emerald-300'
                : 'bg-slate-700 text-slate-400'
            }`}
          >
            {debugInfo.wakeWordActive ? 'Listening' : 'Standby'}
          </span>
        </div>

        <div className="flex items-center space-x-2">
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold flex items-center space-x-1 ${getMicBadgeColor(
              debugInfo.micPermission
            )}`}
          >
            <Mic className="w-3 h-3" />
            <span>{debugInfo.micPermission}</span>
          </span>
          <button
            type="button"
            className="p-1 rounded-md hover:bg-white/10 text-slate-400 cursor-pointer"
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Expanded Diagnostic Details */}
      {isExpanded && (
        <div className="p-3.5 pt-1 space-y-2.5 border-t border-white/10 text-[11px]">
          {/* REQUIRED DEBUG INFO BLOCK */}
          <div className="grid grid-cols-2 gap-1.5 p-2 rounded-xl bg-black/25 border border-white/10">
            <div className="flex items-center justify-between px-2 py-1 rounded bg-white/5">
              <span className="text-slate-400">Microphone:</span>
              <span
                className={`font-bold ${
                  debugInfo.micReady ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {debugInfo.micReady ? 'READY' : 'ERROR'}
              </span>
            </div>
            <div className="flex items-center justify-between px-2 py-1 rounded bg-white/5">
              <span className="text-slate-400">Speech Rec:</span>
              <span
                className={`font-bold ${
                  debugInfo.speechRecReady ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {debugInfo.speechRecReady ? 'READY' : 'ERROR'}
              </span>
            </div>
            <div className="flex items-center justify-between px-2 py-1 rounded bg-white/5">
              <span className="text-slate-400">Listening:</span>
              <span
                className={`font-bold ${
                  debugInfo.isListening ? 'text-emerald-400 animate-pulse' : 'text-slate-400'
                }`}
              >
                {debugInfo.isListening ? 'YES' : 'NO'}
              </span>
            </div>
            <div className="flex items-center justify-between px-2 py-1 rounded bg-white/5">
              <span className="text-slate-400">Wake Standby:</span>
              <span
                className={`font-bold ${
                  debugInfo.wakeWordActive ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                {debugInfo.wakeWordActive ? 'YES' : 'NO'}
              </span>
            </div>
            <div className="flex items-center justify-between px-2 py-1 rounded bg-white/5">
              <span className="text-slate-400">TTS Speaking:</span>
              <span
                className={`font-bold ${
                  debugInfo.isTtsSpeaking ? 'text-amber-400 animate-pulse' : 'text-slate-400'
                }`}
              >
                {debugInfo.isTtsSpeaking ? 'YES' : 'NO'}
              </span>
            </div>
            <div className="flex items-center justify-between px-2 py-1 rounded bg-white/5">
              <span className="text-slate-400">AI Req Source:</span>
              <span
                className={`font-bold ${
                  debugInfo.aiRequestSource === 'USER' ? 'text-emerald-400' : 'text-slate-400'
                }`}
              >
                {debugInfo.aiRequestSource || 'NONE'}
              </span>
            </div>
          </div>

          {/* Diagnostic: Current Voice State Machine */}
          <div className="flex items-center justify-between py-1 border-b border-white/5">
            <span className="text-slate-400">Current voice state:</span>
            <span className="font-bold text-[10px] px-2 py-0.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/30">
              {debugInfo.currentVoiceState || 'IDLE'}
            </span>
          </div>

          {/* Diagnostic: Last Transcript & Current Raw Result */}
          <div className="space-y-1 py-1 border-b border-white/5">
            <div className="flex items-center justify-between text-slate-400">
              <span className="font-semibold text-slate-300">Last Speech Result:</span>
              <span className="text-[10px] text-slate-500">
                {debugInfo.lastRecognizedTimestamp || 'None'}
              </span>
            </div>
            <div
              className={`p-2 rounded-lg border text-xs break-words ${
                debugInfo.lastRecognizedSpeech
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                  : 'bg-black/20 border-white/5 text-slate-500 italic'
              }`}
            >
              {debugInfo.lastRecognizedSpeech ? (
                `"${debugInfo.lastRecognizedSpeech}"`
              ) : (
                'No speech received yet'
              )}
            </div>
            {debugInfo.lastAlternatives && debugInfo.lastAlternatives.length > 1 && (
              <div className="text-[10px] text-slate-400">
                <span className="text-slate-500">Alternatives:</span>{' '}
                {debugInfo.lastAlternatives.map((a, i) => (
                  <span key={i} className="inline-block px-1 py-0.5 mr-1 mb-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                    {a}
                  </span>
                ))}
              </div>
            )}
            {debugInfo.lastMatchedAlias && (
              <div className="text-[10px] text-emerald-400 flex items-center space-x-1">
                <span>Matched Alias:</span>
                <span className="font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/30">
                  {debugInfo.lastMatchedAlias}
                </span>
              </div>
            )}
          </div>

          {/* Diagnostic: Status */}
          <div className="flex items-center justify-between py-1 border-b border-white/5">
            <span className="text-slate-400">Status:</span>
            <span
              className={`font-semibold px-2 py-0.5 rounded border text-[10px] ${getStatusColor(
                debugInfo.recognizerStatus
              )}`}
            >
              {debugInfo.recognizerStatus}
            </span>
          </div>

          {/* Diagnostic: Mic Permission */}
          <div className="flex items-center justify-between py-1 border-b border-white/5">
            <span className="text-slate-400">Mic Permission:</span>
            <div className="flex items-center space-x-2">
              <span className={`font-semibold px-2 py-0.5 rounded ${getMicBadgeColor(debugInfo.micPermission)}`}>
                {debugInfo.micPermission}
              </span>
              {debugInfo.micPermission !== 'granted' && (
                <button
                  type="button"
                  onClick={onRequestMic}
                  className="px-2 py-0.5 rounded bg-emerald-500 text-slate-950 font-bold hover:bg-emerald-400 cursor-pointer text-[10px]"
                >
                  Grant
                </button>
              )}
            </div>
          </div>

          {/* Diagnostic: Last Wake Detected */}
          <div className="py-1 border-b border-white/5">
            <div className="text-slate-400 mb-0.5">Last Wake Detection:</div>
            {debugInfo.lastWakeDetected ? (
              <div className="text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 p-1.5 rounded-lg flex items-start space-x-1.5">
                <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-emerald-400" />
                <div>
                  <span className="font-bold">Detected!</span> {debugInfo.lastWakeDetected}
                </div>
              </div>
            ) : (
              <div className="text-slate-400 italic">None detected yet</div>
            )}
          </div>

          {/* Diagnostic: Platform & ASR Engine */}
          <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5">
            <span>Lang: {debugInfo.activeLangCode}</span>
            <button
              type="button"
              onClick={onRestartListener}
              title="Restart speech recognition engine"
              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center space-x-1 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Restart Engine</span>
            </button>
          </div>

          {/* Test Buttons for Quick Diagnostics */}
          <div className="pt-2 border-t border-white/10 space-y-1.5">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center space-x-1">
              <Zap className="w-3 h-3 text-amber-400" />
              <span>Wake Word Tests (Latin & Devanagari):</span>
            </span>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                id="btn-test-tia-standalone"
                onClick={() => onTestWakeWord('Tia')}
                className="px-2 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-300 text-[10px] font-semibold text-center cursor-pointer active:scale-95"
              >
                "Tia"
              </button>
              <button
                type="button"
                id="btn-test-dia"
                onClick={() => onTestWakeWord('Dia')}
                className="px-2 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-300 text-[10px] font-semibold text-center cursor-pointer active:scale-95"
              >
                "Dia"
              </button>
              <button
                type="button"
                id="btn-test-diya"
                onClick={() => onTestWakeWord('Diya')}
                className="px-2 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-300 text-[10px] font-semibold text-center cursor-pointer active:scale-95"
              >
                "Diya"
              </button>
              <button
                type="button"
                id="btn-test-tiya"
                onClick={() => onTestWakeWord('Tiya')}
                className="px-2 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-300 text-[10px] font-semibold text-center cursor-pointer active:scale-95"
              >
                "Tiya"
              </button>
              <button
                type="button"
                id="btn-test-tea"
                onClick={() => onTestWakeWord('Tea')}
                className="px-2 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-300 text-[10px] font-semibold text-center cursor-pointer active:scale-95"
              >
                "Tea"
              </button>
              <button
                type="button"
                id="btn-test-piya"
                onClick={() => onTestWakeWord('Piya')}
                className="px-2 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-300 text-[10px] font-semibold text-center cursor-pointer active:scale-95"
              >
                "Piya"
              </button>
              <button
                type="button"
                id="btn-test-hey-tia"
                onClick={() => onTestWakeWord('Hey Tia')}
                className="px-2 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-300 text-[10px] font-semibold text-center cursor-pointer active:scale-95"
              >
                "Hey Tia"
              </button>
              <button
                type="button"
                id="btn-test-dev-tiya"
                onClick={() => onTestWakeWord('टिया')}
                className="px-2 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-300 text-[10px] font-semibold text-center cursor-pointer active:scale-95"
              >
                "टिया"
              </button>
              <button
                type="button"
                id="btn-test-dev-piya"
                onClick={() => onTestWakeWord('पिया')}
                className="px-2 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-300 text-[10px] font-semibold text-center cursor-pointer active:scale-95"
              >
                "पिया"
              </button>
              <button
                type="button"
                id="btn-test-dev-diya"
                onClick={() => onTestWakeWord('दीया')}
                className="px-2 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-300 text-[10px] font-semibold text-center cursor-pointer active:scale-95"
              >
                "दीया"
              </button>
              <button
                type="button"
                id="btn-test-dev-t"
                onClick={() => onTestWakeWord('टी')}
                className="px-2 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-300 text-[10px] font-semibold text-center cursor-pointer active:scale-95"
              >
                "टी"
              </button>
              <button
                type="button"
                id="btn-test-hello"
                onClick={() => onTestWakeWord('Hello')}
                className="px-2 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/30 text-rose-300 text-[10px] font-semibold text-center cursor-pointer active:scale-95"
              >
                "Hello" (Ignore)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
