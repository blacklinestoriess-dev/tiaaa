import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  User,
  Calendar,
  MapPin,
  Briefcase,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  LogIn,
  UserPlus,
} from 'lucide-react';
import type { AuthSession } from '../types';
import { parseApiResponse } from '../utils/api';

interface AuthScreenProps {
  isDark: boolean;
  onAuthSuccess: (session: AuthSession) => void;
}

// Age calculation helper based on Date of Birth
function calculateAgeFromDob(dob: string): number | null {
  if (!dob) return null;
  const birthDate = new Date(dob);
  if (isNaN(birthDate.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age >= 0 ? age : 0;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ isDark, onAuthSuccess }) => {
  // Mode: 'login' | 'signup'
  const [mode, setMode] = useState<'login' | 'signup'>('signup');

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form Fields
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [dob, setDob] = useState('');
  const [location, setLocation] = useState('');
  const [currentWork, setCurrentWork] = useState('');

  // Live username availability state
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');

  // Dynamic calculated age
  const calculatedAge = calculateAgeFromDob(dob);

  // Debounced username check for signup mode
  useEffect(() => {
    if (mode !== 'signup') {
      setUsernameStatus('idle');
      return;
    }

    const clean = username.trim().toLowerCase();
    if (clean.length < 3) {
      setUsernameStatus('idle');
      return;
    }

    setUsernameStatus('checking');
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/auth/check-username?username=${encodeURIComponent(clean)}`);
        const data = await parseApiResponse(res, '/api/auth/check-username');
        if (data && data.success) {
          setUsernameStatus(data.available ? 'available' : 'taken');
        }
      } catch {
        setUsernameStatus('idle');
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [username, mode]);

  // Handle Signup Submit
  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    // Validation
    const trimmedName = fullName.trim();
    const cleanUsername = username.trim().toLowerCase();

    if (!trimmedName || trimmedName.length < 2) {
      setErrorMessage('Please enter your Full Name (at least 2 characters).');
      return;
    }

    if (!cleanUsername || cleanUsername.length < 3) {
      setErrorMessage('Username must be at least 3 characters long.');
      return;
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(cleanUsername)) {
      setErrorMessage('Username can only contain letters, numbers, underscores, and hyphens.');
      return;
    }

    if (!password || password.length < 6) {
      setErrorMessage('Password must be at least 6 characters long.');
      return;
    }

    if (!dob) {
      setErrorMessage('Please enter your Date of Birth.');
      return;
    }

    const birthDate = new Date(dob);
    if (isNaN(birthDate.getTime()) || birthDate > new Date()) {
      setErrorMessage('Please enter a valid past Date of Birth.');
      return;
    }

    if (usernameStatus === 'taken') {
      setErrorMessage(`The username "@${cleanUsername}" is already registered. Please choose another username or switch to Log In.`);
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: trimmedName,
          username: cleanUsername,
          password,
          date_of_birth: dob,
          location: location.trim(),
          current_work: currentWork.trim(),
        }),
      });

      const data = await parseApiResponse(res, '/api/auth/signup');

      // Persist session to local storage
      try {
        localStorage.setItem('tia_auth_token', data.token);
        localStorage.setItem(
          'tia_auth_session',
          JSON.stringify({
            token: data.token,
            user: data.user,
            profile: data.profile,
            isNewUser: true,
          })
        );
        localStorage.setItem('tia_user_profile', JSON.stringify(data.profile));
      } catch (storageErr) {
        console.warn('LocalStorage error:', storageErr);
      }

      setSuccessMessage(`Account created! Welcoming you to Tia...`);

      // Automatically launch Tia
      onAuthSuccess({
        token: data.token,
        user: data.user,
        profile: data.profile,
        isNewUser: true,
      });
    } catch (err: any) {
      if (
        err?.status === 409 ||
        err?.code === 'USERNAME_TAKEN' ||
        err?.message?.toLowerCase().includes('already registered') ||
        err?.message?.toLowerCase().includes('already taken')
      ) {
        setErrorMessage(`The username "@${cleanUsername}" is already registered. If this is your account, you can log in directly.`);
      } else {
        setErrorMessage(err.message || 'An error occurred during account creation.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Handle Login Submit
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const cleanUsername = username.trim().toLowerCase();

    if (!cleanUsername) {
      setErrorMessage('Please enter your username.');
      return;
    }

    if (!password) {
      setErrorMessage('Please enter your password.');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: cleanUsername,
          password,
        }),
      });

      const data = await parseApiResponse(res, '/api/auth/login');

      // Persist session to local storage
      try {
        localStorage.setItem('tia_auth_token', data.token);
        localStorage.setItem(
          'tia_auth_session',
          JSON.stringify({
            token: data.token,
            user: data.user,
            profile: data.profile,
            isNewUser: false,
          })
        );
        localStorage.setItem('tia_user_profile', JSON.stringify(data.profile));
      } catch (storageErr) {
        console.warn('LocalStorage error:', storageErr);
      }

      setSuccessMessage(`Welcome back, ${data.profile.full_name}! Opening Tia...`);

      // Automatically launch Tia with this user's profile and memories
      onAuthSuccess({
        token: data.token,
        user: data.user,
        profile: data.profile,
        isNewUser: false,
      });
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to log in. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  // Quick Demo Account Filler
  const handleFillDemo = (u: string, p: string) => {
    setMode('login');
    setUsername(u);
    setPassword(p);
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  return (
    <div
      id="auth-container"
      className={`min-h-screen w-full flex flex-col items-center justify-start py-8 sm:py-12 px-4 pb-28 sm:pb-36 transition-colors duration-200 overflow-y-auto ${
        isDark ? 'bg-[#0b0f19] text-slate-100' : 'bg-slate-50 text-slate-800'
      }`}
    >
      <div className="w-full max-w-lg mx-auto">
        {/* Brand Header */}
        <div id="auth-header" className="text-center mb-6 sm:mb-8">
          <div className="inline-flex items-center justify-center p-3.5 rounded-2xl bg-gradient-to-tr from-rose-500/20 via-rose-500/10 to-transparent border border-rose-500/20 mb-3 shadow-lg shadow-rose-500/10">
            <Sparkles className="w-8 h-8 text-rose-500 animate-pulse" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight bg-gradient-to-r from-rose-500 via-pink-500 to-indigo-500 bg-clip-text text-transparent">
            Tia
          </h1>
          <p className="text-sm font-medium text-slate-400 mt-1">
            Your Personal AI Voice Companion & Friend
          </p>
        </div>

        {/* Status Alerts */}
        {errorMessage && (
          <div
            id="auth-error-alert"
            role="alert"
            className="mb-5 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm flex items-start gap-3 shadow-sm animate-in fade-in slide-in-from-top-2"
          >
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="flex-1 leading-relaxed">
              <div>{errorMessage}</div>
              {(errorMessage.includes('already registered') || errorMessage.includes('already taken')) && (
                <button
                  type="button"
                  id="btn-switch-to-login"
                  onClick={() => {
                    setMode('login');
                    setErrorMessage(null);
                  }}
                  className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 font-semibold text-xs border border-rose-500/30 cursor-pointer transition-colors"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Log in as @{username || 'user'} instead →</span>
                </button>
              )}
            </div>
          </div>
        )}

        {successMessage && (
          <div
            id="auth-success-alert"
            role="status"
            className="mb-5 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm flex items-start gap-3 shadow-sm animate-in fade-in slide-in-from-top-2"
          >
            <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="flex-1 leading-relaxed">{successMessage}</div>
          </div>
        )}

        {/* Main Card */}
        <div
          id="auth-card"
          className={`rounded-2xl border p-6 sm:p-8 shadow-2xl backdrop-blur-xl ${
            isDark
              ? 'bg-slate-900/85 border-slate-800 shadow-black/40'
              : 'bg-white/95 border-slate-200 shadow-slate-300/40'
          }`}
        >
          {/* Mode Switcher Tabs */}
          <div
            id="auth-mode-tabs"
            className={`grid grid-cols-2 p-1 rounded-xl mb-6 border ${
              isDark ? 'bg-slate-800/70 border-slate-700/60' : 'bg-slate-100 border-slate-200'
            }`}
          >
            <button
              type="button"
              id="tab-login"
              onClick={() => {
                setMode('login');
                setErrorMessage(null);
                setSuccessMessage(null);
              }}
              className={`py-2.5 text-sm font-semibold rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer ${
                mode === 'login'
                  ? isDark
                    ? 'bg-rose-500 text-white shadow-md'
                    : 'bg-white text-rose-600 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <LogIn className="w-4 h-4" />
              <span>Log In</span>
            </button>
            <button
              type="button"
              id="tab-signup"
              onClick={() => {
                setMode('signup');
                setErrorMessage(null);
                setSuccessMessage(null);
              }}
              className={`py-2.5 text-sm font-semibold rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer ${
                mode === 'signup'
                  ? isDark
                    ? 'bg-rose-500 text-white shadow-md'
                    : 'bg-white text-rose-600 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <UserPlus className="w-4 h-4" />
              <span>Create Account</span>
            </button>
          </div>

          {/* Form */}
          <form
            onSubmit={mode === 'signup' ? handleSignup : handleLogin}
            className="space-y-4"
          >
            {mode === 'signup' && (
              /* Full Name (Required on Signup) */
              <div>
                <label
                  htmlFor="input-full-name"
                  className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5"
                >
                  Full Name <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <User className="w-4 h-4" />
                  </div>
                  <input
                    id="input-full-name"
                    type="text"
                    required
                    placeholder="e.g. Anurag"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className={`w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm transition-colors outline-none focus:ring-2 focus:ring-rose-500/40 ${
                      isDark
                        ? 'bg-slate-800/60 border-slate-700/80 text-white placeholder-slate-500'
                        : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400'
                    }`}
                  />
                </div>
              </div>
            )}

            {/* Username (Required on both) */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="input-username"
                  className="block text-xs font-semibold uppercase tracking-wider text-slate-400"
                >
                  Username <span className="text-rose-400">*</span>
                </label>
                {mode === 'signup' && username.length >= 3 && (
                  <span className="text-xs">
                    {usernameStatus === 'checking' && (
                      <span className="text-slate-400">checking...</span>
                    )}
                    {usernameStatus === 'available' && (
                      <span className="text-emerald-400 font-medium">✓ Available</span>
                    )}
                    {usernameStatus === 'taken' && (
                      <span className="inline-flex items-center gap-1.5 text-rose-400 font-medium">
                        <span>✗ Taken</span>
                        <button
                          type="button"
                          id="btn-inline-switch-to-login"
                          onClick={() => {
                            setMode('login');
                            setErrorMessage(null);
                          }}
                          className="underline hover:text-rose-300 font-semibold cursor-pointer"
                        >
                          Log in instead?
                        </button>
                      </span>
                    )}
                  </span>
                )}
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 font-medium text-sm">
                  @
                </div>
                <input
                  id="input-username"
                  type="text"
                  required
                  autoCapitalize="none"
                  autoCorrect="off"
                  placeholder="e.g. anurag"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase().trim())}
                  className={`w-full pl-9 pr-4 py-2.5 rounded-xl border text-sm font-medium transition-colors outline-none focus:ring-2 focus:ring-rose-500/40 ${
                    isDark
                      ? 'bg-slate-800/60 border-slate-700/80 text-white placeholder-slate-500'
                      : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400'
                  }`}
                />
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Letters, numbers, underscores, and hyphens (min 3 characters).
              </p>
            </div>

            {/* Password (Required on both) */}
            <div>
              <label
                htmlFor="input-password"
                className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5"
              >
                Password <span className="text-rose-400">*</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="input-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="Enter your password (min 6 characters)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`w-full pl-10 pr-11 py-2.5 rounded-xl border text-sm transition-colors outline-none focus:ring-2 focus:ring-rose-500/40 ${
                    isDark
                      ? 'bg-slate-800/60 border-slate-700/80 text-white placeholder-slate-500'
                      : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400'
                  }`}
                />
                <button
                  type="button"
                  id="btn-toggle-password"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-200 cursor-pointer"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {mode === 'signup' && (
              <>
                {/* Date of Birth & Calculated Age */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label
                      htmlFor="input-dob"
                      className="block text-xs font-semibold uppercase tracking-wider text-slate-400"
                    >
                      Date of Birth <span className="text-rose-400">*</span>
                    </label>
                    {calculatedAge !== null && (
                      <span className="text-xs font-semibold text-rose-400">
                        Age: {calculatedAge} years old
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <Calendar className="w-4 h-4" />
                    </div>
                    <input
                      id="input-dob"
                      type="date"
                      required
                      max={new Date().toISOString().split('T')[0]}
                      value={dob}
                      onChange={(e) => setDob(e.target.value)}
                      className={`w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm transition-colors outline-none focus:ring-2 focus:ring-rose-500/40 ${
                        isDark
                          ? 'bg-slate-800/60 border-slate-700/80 text-white placeholder-slate-500'
                          : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400'
                      }`}
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Tia automatically calculates your age to tailor tone, jokes, and advice.
                  </p>
                </div>

                {/* Location / City (Optional) */}
                <div>
                  <label
                    htmlFor="input-location"
                    className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5"
                  >
                    Location / City <span className="text-slate-500 font-normal">(Optional)</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <MapPin className="w-4 h-4" />
                    </div>
                    <input
                      id="input-location"
                      type="text"
                      placeholder="e.g. Patna, India"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      className={`w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm transition-colors outline-none focus:ring-2 focus:ring-rose-500/40 ${
                        isDark
                          ? 'bg-slate-800/60 border-slate-700/80 text-white placeholder-slate-500'
                          : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400'
                      }`}
                    />
                  </div>
                </div>

                {/* Current Work / Role (Optional) */}
                <div>
                  <label
                    htmlFor="input-work"
                    className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5"
                  >
                    Current Work / Role <span className="text-slate-500 font-normal">(Optional)</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <Briefcase className="w-4 h-4" />
                    </div>
                    <input
                      id="input-work"
                      type="text"
                      placeholder="e.g. Startup, Software Engineer, Student"
                      value={currentWork}
                      onChange={(e) => setCurrentWork(e.target.value)}
                      className={`w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm transition-colors outline-none focus:ring-2 focus:ring-rose-500/40 ${
                        isDark
                          ? 'bg-slate-800/60 border-slate-700/80 text-white placeholder-slate-500'
                          : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400'
                      }`}
                    />
                  </div>
                </div>
              </>
            )}

            {/* Submit Button */}
            <div className="pt-2">
              <button
                id={mode === 'signup' ? 'btn-create-account' : 'btn-submit-login'}
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-rose-500 via-pink-600 to-rose-600 hover:from-rose-600 hover:to-pink-700 text-white font-semibold text-sm shadow-lg shadow-rose-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>{mode === 'signup' ? 'Creating Account...' : 'Logging In...'}</span>
                  </>
                ) : (
                  <>
                    <span>{mode === 'signup' ? 'Create Account' : 'Log In to Tia'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Quick Demo Test Buttons */}
          <div className="mt-6 pt-5 border-t border-slate-700/40">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Quick Demo Switcher
              </span>
              <span className="text-[10px] text-rose-400 font-medium">Test isolated accounts</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                id="btn-demo-anurag"
                onClick={() => handleFillDemo('anurag', 'password123')}
                className={`px-3 py-2 rounded-xl text-xs font-semibold text-left border transition-all cursor-pointer ${
                  isDark
                    ? 'bg-slate-800/60 border-slate-700 hover:border-rose-500/50 hover:bg-rose-500/10 text-slate-200'
                    : 'bg-slate-50 border-slate-200 hover:border-rose-300 hover:bg-rose-50 text-slate-800'
                }`}
              >
                <div className="font-bold text-rose-400">Anurag</div>
                <div className="text-[10px] text-slate-400">Patna • Startup Founder</div>
              </button>

              <button
                type="button"
                id="btn-demo-rahul"
                onClick={() => handleFillDemo('rahul', 'password123')}
                className={`px-3 py-2 rounded-xl text-xs font-semibold text-left border transition-all cursor-pointer ${
                  isDark
                    ? 'bg-slate-800/60 border-slate-700 hover:border-rose-500/50 hover:bg-rose-500/10 text-slate-200'
                    : 'bg-slate-50 border-slate-200 hover:border-rose-300 hover:bg-rose-50 text-slate-800'
                }`}
              >
                <div className="font-bold text-indigo-400">Rahul</div>
                <div className="text-[10px] text-slate-400">Bengaluru • AI Engineer</div>
              </button>
            </div>
            <p className="text-[10px] text-slate-500 text-center mt-2">
              Or type any custom username to create your own private profile!
            </p>
          </div>

          {/* Privacy & Security Footnote */}
          <div className="mt-5 pt-3 border-t border-slate-700/30 flex items-center justify-center gap-2 text-xs text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Private User Storage • PBKDF2 Password Hashing • Isolated Memories</span>
          </div>
        </div>
      </div>
    </div>
  );
};
