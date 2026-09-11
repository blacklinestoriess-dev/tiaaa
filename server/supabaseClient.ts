import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseClient: SupabaseClient | null = null;

/**
 * Returns the lazily initialized Supabase client if configured.
 * Uses SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY).
 */
export function getSupabase(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return null;
  }

  if (!supabaseClient) {
    try {
      supabaseClient = createClient(url, key, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });
    } catch (err) {
      console.error('Failed to initialize Supabase client:', err);
      return null;
    }
  }

  return supabaseClient;
}

export interface SendOtpResult {
  success: boolean;
  message?: string;
  error?: string;
  messageId?: string;
}

export interface VerifyOtpResult {
  success: boolean;
  user?: {
    id: string;
    phone?: string;
    created_at?: string;
  };
  sessionToken?: string;
  error?: string;
}

/**
 * Sends a real OTP to the given phone number via Supabase Authentication.
 */
export async function sendPhoneOtp(normalizedPhone: string): Promise<SendOtpResult> {
  const supabase = getSupabase();
  if (!supabase) {
    return {
      success: false,
      error:
        'Supabase Phone Authentication is not configured. Please define SUPABASE_URL and SUPABASE_ANON_KEY in your environment variables, and enable the Phone provider in Supabase Dashboard (Authentication > Providers > Phone) with an SMS provider (Twilio, MessageBird, Vonage) or add Test Phone Numbers.',
    };
  }

  try {
    const { data, error } = await supabase.auth.signInWithOtp({
      phone: normalizedPhone,
      options: {
        channel: 'sms',
      },
    });

    if (error) {
      console.error('Supabase signInWithOtp error:', error);
      let userFriendlyError = error.message;

      // Handle common Supabase phone auth configuration errors
      if (
        error.message.toLowerCase().includes('provider is not enabled') ||
        error.message.toLowerCase().includes('phone provider disabled')
      ) {
        userFriendlyError =
          'Phone provider is disabled in your Supabase project. Go to Supabase Dashboard > Authentication > Providers > Phone and turn on "Enable Phone Provider".';
      } else if (
        error.message.toLowerCase().includes('sms provider') ||
        error.message.toLowerCase().includes('twilio') ||
        error.message.toLowerCase().includes('credentials')
      ) {
        userFriendlyError =
          'SMS Provider is not configured in Supabase. Please configure Twilio or MessageBird in Supabase Dashboard > Authentication > Providers > Phone, or add this number to "Test phone numbers" with a fixed code for development.';
      } else if (
        error.message.toLowerCase().includes('over_sms_send_rate_limit') ||
        error.message.toLowerCase().includes('rate limit')
      ) {
        userFriendlyError =
          'Too many SMS requests sent. Please wait a few minutes before requesting another OTP.';
      }

      return {
        success: false,
        error: userFriendlyError,
      };
    }

    return {
      success: true,
      message: `OTP sent successfully to ${normalizedPhone}`,
      messageId: (data as any)?.messageId,
    };
  } catch (err: any) {
    console.error('Error invoking Supabase signInWithOtp:', err);
    return {
      success: false,
      error: err.message || 'An unexpected error occurred while sending the OTP.',
    };
  }
}

/**
 * Verifies a 6-digit OTP code using Supabase Authentication.
 */
export async function verifyPhoneOtp(
  normalizedPhone: string,
  token: string
): Promise<VerifyOtpResult> {
  const supabase = getSupabase();
  if (!supabase) {
    return {
      success: false,
      error:
        'Supabase Phone Authentication is not configured. Please define SUPABASE_URL and SUPABASE_ANON_KEY in your environment.',
    };
  }

  try {
    const { data, error } = await supabase.auth.verifyOtp({
      phone: normalizedPhone,
      token: token.trim(),
      type: 'sms',
    });

    if (error) {
      console.error('Supabase verifyOtp error:', error);
      let userFriendlyError = error.message;

      if (
        error.message.toLowerCase().includes('invalid') ||
        error.message.toLowerCase().includes('token has expired') ||
        error.message.toLowerCase().includes('expired')
      ) {
        userFriendlyError = 'Incorrect or expired OTP. Please double-check the 6-digit code or request a new one.';
      }

      return {
        success: false,
        error: userFriendlyError,
      };
    }

    if (!data || !data.user) {
      return {
        success: false,
        error: 'Verification succeeded but no user session was returned by Supabase.',
      };
    }

    return {
      success: true,
      user: {
        id: data.user.id,
        phone: data.user.phone || normalizedPhone,
        created_at: data.user.created_at,
      },
      sessionToken: data.session?.access_token,
    };
  } catch (err: any) {
    console.error('Error invoking Supabase verifyOtp:', err);
    return {
      success: false,
      error: err.message || 'Failed to verify OTP with authentication service.',
    };
  }
}
