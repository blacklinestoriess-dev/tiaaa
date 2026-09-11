import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  Phone,
  User,
  Calendar,
  MapPin,
  Briefcase,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  AlertCircle,
  KeyRound,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import type { AuthSession } from '../types';
import { validateIndianPhone } from '../utils/phone';

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
  // Step: 'form' | 'otp'
  const [authStep, setAuthStep] = useState<'form' | 'otp'>('form');

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form Fields
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [dob, setDob] = useState('');
  const [address, setAddress] = useState('');
  const [occupation, setOccupation] = useState('');

  // Normalized phone info for OTP verification step
  const [normalizedPhone, setNormalizedPhone] = useState('');
  const [displayPhone, setDisplayPhone] = useState('');

  // 6-digit OTP state (array of 6 strings)
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Cooldown countdown timer for Resend OTP
  const [resendCooldown, setResendCooldown] = useState<number>(0);
  const cooldownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Dynamic calculated age
  const calculatedAge = calculateAgeFromDob(dob);

  // Handle countdown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      cooldownTimerRef.current = setInterval(() => {
        setResendCooldown((prev) => {
          if (prev <= 1) {
            if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (cooldownTimerRef.current) {
        clearInterval(cooldownTimerRef.current);
      }
    };
  }, [resendCooldown]);

  // Auto-focus first OTP box when entering OTP step
  useEffect(() => {
    if (authStep === 'otp') {
      const timer = setTimeout(() => {
        otpInputRefs.current[0]?.focus();
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [authStep]);

  // Request OTP (from Signup or Login form)
  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    // 1. Phone validation
    const phoneVal = validateIndianPhone(phone);
    if (!phoneVal.valid || !phoneVal.normalized) {
      setErrorMessage(phoneVal.error || 'Please enter a valid 10-digit Indian mobile number.');
      return;
    }

    // 2. Signup validations
    if (mode === 'signup') {
      if (!fullName.trim() || fullName.trim().length < 2) {
        setErrorMessage('Please enter your Full Name (at least 2 characters).');
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
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: phoneVal.normalized,
          mode,
          full_name: fullName.trim(),
          date_of_birth: dob,
          address: address.trim(),
          occupation_status: occupation.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to send OTP. Please try again.');
      }

      setNormalizedPhone(phoneVal.normalized);
      setDisplayPhone(phoneVal.display || phoneVal.normalized);
      setOtpDigits(['', '', '', '', '', '']);
      setAuthStep('otp');
      setResendCooldown(30); // 30-second cooldown
      setSuccessMessage(data.message || `Verification code sent to ${phoneVal.display}!`);
    } catch (err: any) {
      setErrorMessage(err.message || 'An error occurred while sending OTP.');
    } finally {
      setLoading(false);
    }
  };

  // Resend OTP
  const handleResendOtp = async () => {
    if (resendCooldown > 0 || loading) return;
    setErrorMessage(null);
    setSuccessMessage(null);
    setLoading(true);

    try {
      const res = await fetch('/api/auth/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: normalizedPhone,
          mode,
          full_name: fullName.trim(),
          date_of_birth: dob,
          address: address.trim(),
          occupation_status: occupation.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to resend verification code.');
      }

      setOtpDigits(['', '', '', '', '', '']);
      setResendCooldown(30);
      setSuccessMessage(`A new verification code has been sent to ${displayPhone}.`);
      otpInputRefs.current[0]?.focus();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to resend OTP.');
    } finally {
      setLoading(false);
    }
  };

  // Handle individual digit input in OTP 6-box input
  const handleOtpDigitChange = (index: number, val: string) => {
    // Only allow digits
    const cleaned = val.replace(/\D/g, '');

    // Handle paste event where user pastes whole 6-digit code into one box
    if (cleaned.length > 1) {
      const chars = cleaned.slice(0, 6).split('');
      const newDigits = [...otpDigits];
      chars.forEach((ch, idx) => {
        if (index + idx < 6) {
          newDigits[index + idx] = ch;
        }
      });
      setOtpDigits(newDigits);
      const nextIdx = Math.min(index + chars.length, 5);
      otpInputRefs.current[nextIdx]?.focus();
      return;
    }

    const singleDigit = cleaned.slice(-1);
    const newDigits = [...otpDigits];
    newDigits[index] = singleDigit;
    setOtpDigits(newDigits);

    // Auto-advance to next box if digit was typed
    if (singleDigit && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  // Handle backspace navigation in OTP boxes
  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!otpDigits[index] && index > 0) {
        // Move back to previous box and clear it
        otpInputRefs.current[index - 1]?.focus();
        const newDigits = [...otpDigits];
        newDigits[index - 1] = '';
        setOtpDigits(newDigits);
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  // Handle OTP Verification Submit
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const fullOtp = otpDigits.join('').trim();
    if (fullOtp.length !== 6) {
      setErrorMessage('Please enter all 6 digits of your verification code.');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: normalizedPhone,
          otp: fullOtp,
          mode,
          full_name: fullName.trim(),
          date_of_birth: dob,
          address: address.trim(),
          occupation_status: occupation.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(
          data.error || 'Incorrect or expired verification code. Please try again.'
        );
      }

      // Store in localStorage for session persistence across refreshes
      try {
        localStorage.setItem('tia_auth_token', data.token);
        localStorage.setItem(
          'tia_auth_session',
          JSON.stringify({
            token: data.token,
            user: data.user,
            profile: data.profile,
            isNewUser: data.isNewUser,
          })
        );
        localStorage.setItem('tia_user_profile', JSON.stringify(data.profile));
      } catch (storageErr) {
        console.warn('LocalStorage error:', storageErr);
      }

      onAuthSuccess({
        token: data.token,
        user: data.user,
        profile: data.profile,
        isNewUser: data.isNewUser,
      });
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to verify verification code.');
    } finally {
      setLoading(false);
    }
  };

  // Switch back to form to edit details / phone number
  const handleChangePhoneNumber = () => {
    setAuthStep('form');
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  return (
    <div
      id="auth-container"
      className={`min-h-screen w-full transition-colors duration-200 overflow-y-auto ${
        isDark ? 'bg-[#0b0f19] text-slate-100' : 'bg-slate-50 text-slate-800'
      }`}
    >
      <div className="w-full max-w-xl mx-auto px-4 py-8 sm:py-12 pb-24 sm:pb-32">
        {/* Brand Header */}
        <div id="auth-header" className="text-center mb-8">
          <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-gradient-to-tr from-rose-500/20 via-rose-500/10 to-transparent border border-rose-500/20 mb-3 shadow-lg shadow-rose-500/5">
            <Sparkles className="w-8 h-8 text-rose-500 animate-pulse" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-rose-500 via-pink-500 to-indigo-500 bg-clip-text text-transparent">
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
            className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm flex items-start gap-3 animate-in fade-in slide-in-from-top-2"
          >
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="flex-1 leading-relaxed">{errorMessage}</div>
          </div>
        )}

        {successMessage && (
          <div
            id="auth-success-alert"
            role="status"
            className="mb-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm flex items-start gap-3 animate-in fade-in slide-in-from-top-2"
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
              ? 'bg-slate-900/80 border-slate-800/80 shadow-black/40'
              : 'bg-white/90 border-slate-200/90 shadow-slate-300/40'
          }`}
        >
          {authStep === 'form' ? (
            /* =================================================================
               STEP 1: Phone Number & Profile Form (Login / Signup)
               ================================================================= */
            <div>
              {/* Navigation Tabs (Signup / Login) */}
              <div
                id="auth-mode-tabs"
                className={`grid grid-cols-2 p-1 rounded-xl mb-6 border ${
                  isDark ? 'bg-slate-800/60 border-slate-700/50' : 'bg-slate-100 border-slate-200'
                }`}
              >
                <button
                  type="button"
                  id="tab-signup"
                  onClick={() => {
                    setMode('signup');
                    setErrorMessage(null);
                    setSuccessMessage(null);
                  }}
                  className={`py-2 text-sm font-semibold rounded-lg transition-all cursor-pointer ${
                    mode === 'signup'
                      ? isDark
                        ? 'bg-rose-500 text-white shadow-md'
                        : 'bg-white text-rose-600 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Create Account
                </button>
                <button
                  type="button"
                  id="tab-login"
                  onClick={() => {
                    setMode('login');
                    setErrorMessage(null);
                    setSuccessMessage(null);
                  }}
                  className={`py-2 text-sm font-semibold rounded-lg transition-all cursor-pointer ${
                    mode === 'login'
                      ? isDark
                        ? 'bg-rose-500 text-white shadow-md'
                        : 'bg-white text-rose-600 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Log In
                </button>
              </div>

              <form onSubmit={handleRequestOtp} className="space-y-4">
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

                {/* Phone Number (Required on both) */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label
                      htmlFor="input-phone-number"
                      className="block text-xs font-semibold uppercase tracking-wider text-slate-400"
                    >
                      Phone Number <span className="text-rose-400">*</span>
                    </label>
                    <span className="text-[11px] text-slate-400">
                      Indian Mobile (+91)
                    </span>
                  </div>
                  <div className="relative flex items-center">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 gap-1.5">
                      <Phone className="w-4 h-4 text-rose-400" />
                      <span className="text-xs font-bold text-slate-400 pl-0.5 border-r border-slate-700 pr-2">
                        +91
                      </span>
                    </div>
                    <input
                      id="input-phone-number"
                      type="tel"
                      required
                      placeholder="98765 43210"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className={`w-full pl-20 pr-4 py-2.5 rounded-xl border text-sm font-medium tracking-wide transition-colors outline-none focus:ring-2 focus:ring-rose-500/40 ${
                        isDark
                          ? 'bg-slate-800/60 border-slate-700/80 text-white placeholder-slate-500'
                          : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400'
                      }`}
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Enter your 10-digit mobile number. We'll send a real 6-digit OTP code to verify.
                  </p>
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
                          <span className="text-xs font-medium text-rose-400">
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
                        Tia calculates your age automatically to personalize conversation tone.
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
                          value={address}
                          onChange={(e) => setAddress(e.target.value)}
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
                          value={occupation}
                          onChange={(e) => setOccupation(e.target.value)}
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
                    id="btn-send-otp"
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white font-semibold text-sm shadow-lg shadow-rose-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Sending OTP...</span>
                      </>
                    ) : (
                      <>
                        <span>{mode === 'signup' ? 'Continue & Send OTP' : 'Send OTP Code'}</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          ) : (
            /* =================================================================
               STEP 2: OTP Verification Screen
               ================================================================= */
            <div id="otp-verification-screen" className="space-y-6">
              {/* Back to Form */}
              <button
                type="button"
                id="btn-change-phone"
                onClick={handleChangePhoneNumber}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Change phone number</span>
              </button>

              <div className="text-center space-y-2">
                <div className="inline-flex p-3 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">
                  <KeyRound className="w-6 h-6" />
                </div>
                <h2 className="text-xl font-bold tracking-tight">Verify your phone</h2>
                <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
                  We've sent a 6-digit verification code to{' '}
                  <strong className="text-rose-400 font-semibold">{displayPhone}</strong>
                </p>
              </div>

              {/* 6-Digit OTP Form */}
              <form onSubmit={handleVerifyOtp} className="space-y-6">
                <div className="flex items-center justify-center gap-2 sm:gap-3">
                  {otpDigits.map((digit, idx) => (
                    <input
                      key={idx}
                      ref={(el) => {
                        otpInputRefs.current[idx] = el;
                      }}
                      id={`otp-box-${idx}`}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleOtpDigitChange(idx, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                      autoComplete="one-time-code"
                      className={`w-11 h-13 sm:w-13 sm:h-14 text-center text-xl sm:text-2xl font-bold rounded-xl border transition-all outline-none focus:ring-2 focus:ring-rose-500 focus:border-rose-500 ${
                        isDark
                          ? 'bg-slate-800/80 border-slate-700 text-white'
                          : 'bg-slate-50 border-slate-300 text-slate-900'
                      } ${digit ? 'border-rose-500/70 shadow-sm shadow-rose-500/20' : ''}`}
                    />
                  ))}
                </div>

                {/* Verify Button */}
                <button
                  id="btn-verify-otp"
                  type="submit"
                  disabled={loading || otpDigits.join('').length !== 6}
                  className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white font-semibold text-sm shadow-lg shadow-rose-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Verifying Code...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" />
                      <span>Verify OTP</span>
                    </>
                  )}
                </button>

                {/* Resend OTP & Cooldown Timer */}
                <div className="flex items-center justify-center gap-2 text-xs pt-1">
                  <span className="text-slate-400">Didn't receive the code?</span>
                  {resendCooldown > 0 ? (
                    <span className="text-slate-500 font-medium">
                      Resend in {resendCooldown}s
                    </span>
                  ) : (
                    <button
                      type="button"
                      id="btn-resend-otp"
                      onClick={handleResendOtp}
                      disabled={loading}
                      className="font-semibold text-rose-400 hover:text-rose-300 transition-colors cursor-pointer underline underline-offset-4"
                    >
                      Resend OTP
                    </button>
                  )}
                </div>
              </form>
            </div>
          )}

          {/* Privacy & Security Footnote */}
          <div className="mt-8 pt-4 border-t border-slate-700/30 flex items-center justify-center gap-2 text-xs text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Encrypted with Supabase Authentication & Private Row-Level Security</span>
          </div>
        </div>
      </div>
    </div>
  );
};
