import React, { useState, useId } from 'react';
import {
  Sparkles,
  Mail,
  Lock,
  User,
  Calendar,
  MapPin,
  Briefcase,
  Eye,
  EyeOff,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
  KeyRound,
  CheckCircle2,
} from 'lucide-react';
import type { AuthSession } from '../types';

interface AuthScreenProps {
  isDark: boolean;
  onAuthSuccess: (session: AuthSession) => void;
}

// Age calculation helper
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
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>('login');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [dob, setDob] = useState('');
  const [address, setAddress] = useState('');
  const [occupation, setOccupation] = useState('');
  const [gender, setGender] = useState('unspecified');

  // Forgot password two-step state
  const [forgotStep, setForgotStep] = useState<1 | 2>(1);
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);

  const calculatedAge = calculateAgeFromDob(dob);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!email.trim() || !password) {
      setErrorMessage('Please enter both email address and password.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to log in. Please verify your credentials.');
      }

      onAuthSuccess({
        token: data.token,
        user: data.user,
        profile: data.profile,
        isNewUser: false,
      });
    } catch (err: any) {
      setErrorMessage(err.message || 'An error occurred during login.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!fullName.trim() || fullName.trim().length < 2) {
      setErrorMessage('Please enter your full name (at least 2 characters).');
      return;
    }
    if (!email.trim() || !email.includes('@') || !email.includes('.')) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }
    if (!password || password.length < 6) {
      setErrorMessage('Password must be at least 6 characters.');
      return;
    }
    if (!dob) {
      setErrorMessage('Please enter your Date of Birth.');
      return;
    }

    // Check that birth date is not in future
    const birthDate = new Date(dob);
    if (isNaN(birthDate.getTime()) || birthDate > new Date()) {
      setErrorMessage('Please enter a valid past Date of Birth.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName.trim(),
          email: email.trim(),
          password,
          date_of_birth: dob,
          address: address.trim() || '',
          occupation_status: occupation.trim() || 'Explorer',
          gender,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to create account.');
      }

      onAuthSuccess({
        token: data.token,
        user: data.user,
        profile: data.profile,
        isNewUser: true,
      });
    } catch (err: any) {
      setErrorMessage(err.message || 'An error occurred during registration.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!email.trim() || !email.includes('@')) {
      setErrorMessage('Please provide a valid email address.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Unable to process password reset request.');
      }

      if (data.resetCode) {
        setResetCode(data.resetCode);
      }
      setForgotStep(2);
      setSuccessMessage(
        data.message ||
          'Verification code generated! Please enter the 6-digit code and your new password below.'
      );
    } catch (err: any) {
      setErrorMessage(err.message || 'Unable to process password reset.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!resetCode.trim()) {
      setErrorMessage('Please enter the 6-digit verification code.');
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      setErrorMessage('New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMessage('Passwords do not match. Please re-enter.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          resetCode: resetCode.trim(),
          newPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to reset password.');
      }

      // Switch back to login with success alert
      setSuccessMessage(
        'Password successfully updated! Please log in with your new password.'
      );
      setMode('login');
      setPassword('');
      setForgotStep(1);
      setResetCode('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      id="auth-container"
      className={`w-full min-h-screen min-h-[100dvh] h-auto flex flex-col items-center justify-start px-4 sm:px-6 pt-8 sm:pt-12 pb-16 sm:pb-24 overflow-y-auto overflow-x-hidden transition-colors ${
        isDark ? 'bg-[#0b0f19] text-slate-100' : 'bg-slate-50 text-slate-900'
      }`}
      style={{
        minHeight: '100vh',
        height: 'auto',
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      <div className="w-full max-w-md my-auto py-2 flex flex-col items-stretch">
        {/* Brand Logo & Headline */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-rose-500 via-purple-600 to-indigo-600 shadow-xl shadow-rose-500/20 mb-3 animate-pulse">
            <Sparkles className="w-7 h-7 text-white" />
          </div>
          <h1
            id="auth-title"
            className={`text-2xl sm:text-3xl font-bold tracking-tight font-display ${
              isDark ? 'text-white' : 'text-slate-900'
            }`}
          >
            Meet Tia
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Your personal, witty & private AI companion
          </p>
        </div>

        {/* Card Container */}
        <div
          id="auth-card"
          className={`rounded-2xl border p-6 sm:p-8 backdrop-blur-md shadow-2xl transition-all h-auto ${
            isDark
              ? 'bg-slate-900/85 border-slate-800 text-slate-100'
              : 'bg-white/95 border-slate-200 text-slate-900 shadow-slate-200/50'
          }`}
          style={{ height: 'auto', maxHeight: 'none' }}
        >
            {/* Top Mode Tabs */}
            {mode !== 'forgot' ? (
              <div className="flex border-b border-slate-700/40 pb-3 mb-6">
                <button
                  type="button"
                  id="tab-login"
                  onClick={() => {
                    setMode('login');
                    setErrorMessage(null);
                    setSuccessMessage(null);
                  }}
                  className={`flex-1 pb-2 text-sm font-semibold text-center border-b-2 transition-all cursor-pointer ${
                    mode === 'login'
                      ? 'border-rose-500 text-rose-500 font-bold'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Log In
                </button>
                <button
                  type="button"
                  id="tab-signup"
                  onClick={() => {
                    setMode('signup');
                    setErrorMessage(null);
                    setSuccessMessage(null);
                  }}
                  className={`flex-1 pb-2 text-sm font-semibold text-center border-b-2 transition-all cursor-pointer ${
                    mode === 'signup'
                      ? 'border-rose-500 text-rose-500 font-bold'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Create Account
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between pb-3 mb-6 border-b border-slate-700/40">
                <span className="text-sm font-semibold text-rose-400 flex items-center gap-1.5">
                  <KeyRound className="w-4 h-4" /> Reset Password
                </span>
                <button
                  type="button"
                  id="btn-back-to-login"
                  onClick={() => {
                    setMode('login');
                    setForgotStep(1);
                    setErrorMessage(null);
                    setSuccessMessage(null);
                  }}
                  className="text-xs text-slate-400 hover:text-slate-200 underline cursor-pointer"
                >
                  Back to Log In
                </button>
              </div>
            )}

            {/* Error Alert */}
            {errorMessage && (
              <div
                id="auth-error-alert"
                className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-start gap-2"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Success Alert */}
            {successMessage && (
              <div
                id="auth-success-alert"
                className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-start gap-2"
              >
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{successMessage}</span>
              </div>
            )}

            {/* LOGIN FORM */}
            {mode === 'login' && (
              <form id="form-login" onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 absolute left-3.5 top-3 text-slate-500" />
                    <input
                      id="input-login-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@example.com"
                      className={`w-full pl-10 pr-3 py-2 rounded-xl text-sm border outline-none transition-all ${
                        isDark
                          ? 'bg-slate-800/80 border-slate-700 text-white focus:border-rose-500 focus:ring-1 focus:ring-rose-500'
                          : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-rose-500 focus:ring-1 focus:ring-rose-500'
                      }`}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-medium text-slate-400">
                      Password
                    </label>
                    <button
                      type="button"
                      id="btn-goto-forgot-pass"
                      onClick={() => {
                        setMode('forgot');
                        setForgotStep(1);
                        setErrorMessage(null);
                        setSuccessMessage(null);
                      }}
                      className="text-xs text-rose-400 hover:text-rose-300 cursor-pointer"
                    >
                      Forgot Password?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3.5 top-3 text-slate-500" />
                    <input
                      id="input-login-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className={`w-full pl-10 pr-10 py-2 rounded-xl text-sm border outline-none transition-all ${
                        isDark
                          ? 'bg-slate-800/80 border-slate-700 text-white focus:border-rose-500 focus:ring-1 focus:ring-rose-500'
                          : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-rose-500 focus:ring-1 focus:ring-rose-500'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200 cursor-pointer"
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  id="btn-submit-login"
                  disabled={loading}
                  className="w-full mt-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-rose-500 via-purple-600 to-indigo-600 hover:from-rose-600 hover:to-indigo-700 text-white font-medium text-sm shadow-lg shadow-rose-500/25 flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50"
                >
                  {loading ? (
                    <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <span>Log In to Tia</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            )}

            {/* SIGN UP FORM */}
            {mode === 'signup' && (
              <form id="form-signup" onSubmit={handleSignup} className="space-y-3.5">
                {/* Full Name (Required) */}
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Full Name <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
                    <input
                      id="input-signup-fullname"
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g. Rahul Sharma"
                      className={`w-full pl-9 pr-3 py-2 rounded-xl text-sm border outline-none transition-all ${
                        isDark
                          ? 'bg-slate-800/80 border-slate-700 text-white focus:border-rose-500'
                          : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-rose-500'
                      }`}
                    />
                  </div>
                </div>

                {/* Email (Required) */}
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Email Address <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
                    <input
                      id="input-signup-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@example.com"
                      className={`w-full pl-9 pr-3 py-2 rounded-xl text-sm border outline-none transition-all ${
                        isDark
                          ? 'bg-slate-800/80 border-slate-700 text-white focus:border-rose-500'
                          : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-rose-500'
                      }`}
                    />
                  </div>
                </div>

                {/* Password (Required) */}
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Password <span className="text-rose-400">*</span> (min 6 characters)
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
                    <input
                      id="input-signup-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className={`w-full pl-9 pr-10 py-2 rounded-xl text-sm border outline-none transition-all ${
                        isDark
                          ? 'bg-slate-800/80 border-slate-700 text-white focus:border-rose-500'
                          : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-rose-500'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-2 text-slate-400 hover:text-slate-200 cursor-pointer"
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Date of Birth (Required) + Auto-calculated Age */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-slate-400">
                      Date of Birth <span className="text-rose-400">*</span>
                    </label>
                    {calculatedAge !== null && (
                      <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                        Calculated Age: {calculatedAge} years
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <Calendar className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
                    <input
                      id="input-signup-dob"
                      type="date"
                      required
                      max={new Date().toISOString().split('T')[0]}
                      value={dob}
                      onChange={(e) => setDob(e.target.value)}
                      className={`w-full pl-9 pr-3 py-2 rounded-xl text-sm border outline-none transition-all ${
                        isDark
                          ? 'bg-slate-800/80 border-slate-700 text-white focus:border-rose-500'
                          : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-rose-500'
                      }`}
                    />
                  </div>
                </div>

                {/* Address / City (Optional) */}
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Location / City <span className="text-slate-500 text-[10px]">(Optional)</span>
                  </label>
                  <div className="relative">
                    <MapPin className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
                    <input
                      id="input-signup-address"
                      type="text"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="e.g. Mumbai, Maharashtra"
                      className={`w-full pl-9 pr-3 py-2 rounded-xl text-sm border outline-none transition-all ${
                        isDark
                          ? 'bg-slate-800/80 border-slate-700 text-white focus:border-rose-500'
                          : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-rose-500'
                      }`}
                    />
                  </div>
                </div>

                {/* Current Work / Occupation (Optional) */}
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Current Work / Role <span className="text-slate-500 text-[10px]">(Optional)</span>
                  </label>
                  <div className="relative">
                    <Briefcase className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
                    <input
                      id="input-signup-occupation"
                      type="text"
                      value={occupation}
                      onChange={(e) => setOccupation(e.target.value)}
                      placeholder="e.g. Software Engineer, Student, Designer"
                      className={`w-full pl-9 pr-3 py-2 rounded-xl text-sm border outline-none transition-all ${
                        isDark
                          ? 'bg-slate-800/80 border-slate-700 text-white focus:border-rose-500'
                          : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-rose-500'
                      }`}
                    />
                  </div>
                </div>

                {/* Gender (Optional) */}
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Gender <span className="text-slate-500 text-[10px]">(Optional)</span>
                  </label>
                  <select
                    id="select-signup-gender"
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                    className={`w-full px-3 py-2 rounded-xl text-sm border outline-none transition-all ${
                      isDark
                        ? 'bg-slate-800/80 border-slate-700 text-white focus:border-rose-500'
                        : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-rose-500'
                    }`}
                  >
                    <option value="unspecified">Prefer not to say</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Non-binary">Non-binary</option>
                  </select>
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  id="btn-submit-signup"
                  disabled={loading}
                  className="w-full mt-3 py-2.5 px-4 rounded-xl bg-gradient-to-r from-rose-500 via-purple-600 to-indigo-600 hover:from-rose-600 hover:to-indigo-700 text-white font-medium text-sm shadow-lg shadow-rose-500/25 flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50"
                >
                  {loading ? (
                    <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <span>Create Account & Meet Tia</span>
                      <Sparkles className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            )}

            {/* FORGOT PASSWORD FLOW */}
            {mode === 'forgot' && forgotStep === 1 && (
              <form id="form-forgot-step1" onSubmit={handleForgotPassword} className="space-y-4">
                <p className="text-xs text-slate-400">
                  Enter your registered account email. A secure 6-digit verification code will be generated to reset your password.
                </p>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 absolute left-3.5 top-3 text-slate-500" />
                    <input
                      id="input-forgot-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@example.com"
                      className={`w-full pl-10 pr-3 py-2 rounded-xl text-sm border outline-none transition-all ${
                        isDark
                          ? 'bg-slate-800/80 border-slate-700 text-white focus:border-rose-500'
                          : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-rose-500'
                      }`}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  id="btn-submit-forgot"
                  disabled={loading}
                  className="w-full py-2.5 px-4 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-medium text-sm shadow-lg shadow-rose-500/25 flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50"
                >
                  {loading ? (
                    <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <span>Request Reset Code</span>
                  )}
                </button>
              </form>
            )}

            {/* FORGOT PASSWORD STEP 2: VERIFICATION & NEW PASSWORD */}
            {mode === 'forgot' && forgotStep === 2 && (
              <form id="form-forgot-step2" onSubmit={handleResetPassword} className="space-y-3.5">
                <p className="text-xs text-slate-400">
                  Enter the 6-digit verification code sent for <strong className="text-rose-400">{email}</strong> and set your new password.
                </p>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    6-Digit Verification Code <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 absolute left-3.5 top-3 text-slate-500" />
                    <input
                      id="input-reset-code"
                      type="text"
                      required
                      maxLength={6}
                      value={resetCode}
                      onChange={(e) => setResetCode(e.target.value)}
                      placeholder="123456"
                      className={`w-full pl-10 pr-3 py-2 rounded-xl text-sm tracking-widest font-mono font-bold border outline-none transition-all ${
                        isDark
                          ? 'bg-slate-800/80 border-slate-700 text-emerald-400 focus:border-rose-500'
                          : 'bg-slate-50 border-slate-300 text-emerald-600 focus:border-rose-500'
                      }`}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    New Password <span className="text-rose-400">*</span> (min 6 characters)
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3.5 top-3 text-slate-500" />
                    <input
                      id="input-new-password"
                      type={showNewPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="New password"
                      className={`w-full pl-10 pr-10 py-2 rounded-xl text-sm border outline-none transition-all ${
                        isDark
                          ? 'bg-slate-800/80 border-slate-700 text-white focus:border-rose-500'
                          : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-rose-500'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200 cursor-pointer"
                    >
                      {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Confirm New Password <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3.5 top-3 text-slate-500" />
                    <input
                      id="input-confirm-password"
                      type={showNewPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm new password"
                      className={`w-full pl-10 pr-3 py-2 rounded-xl text-sm border outline-none transition-all ${
                        isDark
                          ? 'bg-slate-800/80 border-slate-700 text-white focus:border-rose-500'
                          : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-rose-500'
                      }`}
                    />
                  </div>
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setForgotStep(1)}
                    className="py-2.5 px-3 rounded-xl border border-slate-700 text-xs text-slate-300 hover:bg-white/5 cursor-pointer"
                  >
                    Resend Code
                  </button>
                  <button
                    type="submit"
                    id="btn-submit-new-password"
                    disabled={loading}
                    className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50"
                  >
                    {loading ? (
                      <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <span>Save New Password & Log In</span>
                    )}
                  </button>
                </div>
              </form>
            )}

            {/* Privacy & RLS note */}
            <div className="mt-6 pt-4 border-t border-slate-700/30 flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Isolated User Session & Row-Level Security Enforced</span>
            </div>
          </div>
        </div>
      </div>
    );
  };
