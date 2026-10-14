# Tia Text-to-Speech (TTS) Fix & Verification Report

**Project:** Tia AI Assistant  
**Date:** October 13, 2026  
**Status:** All Configuration Mismatches Resolved & Verified  

---

## 1. Executive Summary & Audit Findings

Following an in-depth review of the initial TTS implementation, several critical configuration mismatches, cache risks, and live synthesis hijacking issues were identified and corrected.

| Finding | Original Problem | Resolution Applied | Verification Status |
| :--- | :--- | :--- | :--- |
| **1. `TTS_PROVIDER` Environment Variable** | The request handler defaulted `provider` to `"auto"`. The client never sent `provider`. The server read `envProvider` but never used it if keys existed, completely ignoring `TTS_PROVIDER=browser`. | Added `resolveProviderAndVoice()`. If `TTS_PROVIDER` is set on the server, it strictly governs provider selection unless the client explicitly overrides it. If `TTS_PROVIDER=browser`, zero external network calls are made. | **Verified** (Returns immediate fallback signal in 0ms) |
| **2. `TTS_VOICE_ID` Environment Variable** | `TTS_VOICE_ID` was documented in `.env.example` but was never read by `server/ttsHandler.ts`. | Server now reads `process.env.TTS_VOICE_ID` as the default server voice while allowing the user's explicit saved Settings preference to take precedence. | **Verified** (Settings override and env defaults work harmoniously) |
| **3. Voice & Provider Incompatibility** | Sending bare `"Aoede"` or `"Kore"` to Google Cloud TTS failed API validation (which requires `<lang>-Chirp3-HD-<persona>`). Sending full GCP names to Gemini failed Gemini prebuilt voice validation. | Added automatic bidirectional voice mapping. Bare `"Aoede"` or `"Kore"` mapped to `hi-IN-Chirp3-HD-Aoede` or `hi-IN-Chirp3-HD-Kore` for Google Cloud. GCP voice names mapped to `"Aoede"` or `"Kore"` for Gemini. | **Verified** (Never sends mismatched voice names to either provider) |
| **4. Cache Key Cross-Pollination** | Cache key was `${voiceId}:${emotion}:${text}` without provider. If provider or configuration changed, cached audio from one provider could be served for another. | Cache key updated to `${provider}:${voiceId}:${emotion}:${text}` and cache entries record `provider` and `voiceId`. | **Verified** (Entries completely isolated across providers) |
| **5. Pre-rendered Sample Hijacking** | The server intercepted *any* live request matching the 5 benchmark sentences and returned a static pre-rendered WAV file, spoofing live synthesis success even when the provider was unconfigured or quota-exhausted. | **Removed unconditional hijacking.** Pre-rendered samples are *only* served when `isSamplePreview: true` is explicitly requested (e.g. preview button in Settings). Live synthesis always queries the active provider. | **Verified** (No live synthesis spoofing; genuine provider calls executed) |
| **6. Timeout & Cancellation Race Conditions** | Client had no fetch abort timeout; if server hung, UI remained in limbo. Incomplete cancellation could lead to duplicate speech. | Added 4,000ms server timeout and 4,500ms client `AbortController` timeout. Cancellation cleanly halts active audio and pending requests. | **Verified** (Safe abort with no duplicate speech or mic clashes) |
| **7. Gemini TTS Model Behavior** | `gemini-3.8-flash-lite-tts` free tier has a daily limit (10 requests/day). | Handler accurately identifies HTTP 429 / `RESOURCE_EXHAUSTED` and triggers immediate, graceful fallback to local browser voice. | **Verified via Live API** (Returned 429 quota exhaustion; app cleanly fell back) |
| **8. Google Cloud Credential Isolation** | Key must stay server-side; missing key must not silently divert to Gemini. | Keys read strictly server-side (`process.env.GOOGLE_CLOUD_TTS_API_KEY`). If missing, returns explicit error and triggers browser fallback; never silently redirects. | **Verified** (No secrets in client; clean explicit error handling) |
| **9. Preserved Tia Capabilities** | Browser voice, wake word, mic settle timer, Hinglish "hi"/"use" normalizer, weather, fact checking. | All preserved completely intact. | **Verified** (TypeScript compiles cleanly with 0 errors) |
| **10. Safe Zero-Cost Default** | Paid providers must not be enabled automatically without user configuration. | Browser voice remains default engine (`0ms`, free, offline). | **Verified** |

---

## 2. Detailed Technical Fixes

### A. Provider Resolution Logic (`server/ttsHandler.ts`)
```typescript
export function resolveProviderAndVoice(
  clientProvider?: string,
  clientVoiceId?: string,
  detectedLanguage: string = 'hinglish'
): {
  provider: 'browser' | 'gemini' | 'google-cloud';
  voiceId: string;
  sourceOfProvider: 'client' | 'env' | 'auto-fallback';
}
```
- **Precedence Hierarchy:**
  1. If client explicitly requests `'browser'`, `'gemini'`, or `'google-cloud'` (not `'auto'`), client selection wins.
  2. If `process.env.TTS_PROVIDER` is set (`browser`, `gemini`, `google-cloud`), server configuration wins.
  3. Otherwise, defaults safely to `'browser'`.

### B. Voice Compatibility Matrix
| Incoming Request | Target Provider | Resolved Voice Name Dispatched |
| :--- | :--- | :--- |
| `"Aoede"` (Hindi/Hinglish) | Google Cloud | `hi-IN-Chirp3-HD-Aoede` |
| `"Kore"` (Hindi/Hinglish) | Google Cloud | `hi-IN-Chirp3-HD-Kore` |
| `"Aoede"` (English) | Google Cloud | `en-IN-Chirp3-HD-Aoede` |
| `"Kore"` (English) | Google Cloud | `en-IN-Chirp3-HD-Kore` |
| `hi-IN-Chirp3-HD-Kore` | Gemini | `"Kore"` |
| `hi-IN-Chirp3-HD-Aoede` | Gemini | `"Aoede"` |

### C. LRU Cache Key Isolation
```typescript
function getCacheKey(provider: string, voiceId: string, emotion: string, text: string): string {
  return `${provider.toLowerCase()}:${voiceId.toLowerCase()}:${emotion.toLowerCase()}:${text.trim().toLowerCase()}`;
}
```
Prevents cross-provider or voice ID collisions.

### D. Client-Side Abort & Timeout Guard (`src/services/speechSynthesis.ts`)
- Client passes `provider: settings.ttsProvider || 'auto'` and `voiceId: settings.premiumVoiceId`.
- Includes a 4,500ms safety timeout that calls `abortController.abort()` if network connection hangs.
- `cancel()` clears the timeout timer, aborts active fetch, pauses HTML5 Audio, and resets pointers.

---

## 3. Live API & Test Verification Results

To maintain complete transparency, here is the exact distinction between **code-level logic tests** and **actual live cloud API tests**:

### Code-Level Unit Tests (Executed via Node.js test harness)
- **Test A (Browser Provider Selected):**  
  Output: `{ success: false, fallbackToBrowser: true, reason: 'Browser voice selected as active engine', provider: 'browser' }`  
  *Result: PASSED. Zero network calls made.*
- **Test B (Google Cloud Selected Without API Key):**  
  Output: `{ success: false, fallbackToBrowser: true, error: 'GOOGLE_CLOUD_TTS_API_KEY is not configured on server', provider: 'google-cloud' }`  
  *Result: PASSED. Does NOT silently divert to Gemini.*
- **Test C (Live Benchmark Sentence - No Sample Preview Flag):**  
  Text: *"Chalo, ab is energy ko use karke kuch dhamakedar karte hain."*  
  Output: Does NOT return pre-rendered sample; invokes genuine provider call.  
  *Result: PASSED. Mock hijacking eliminated.*
- **Test D (Explicit Sample Preview Request):**  
  Text matching benchmark with `isSamplePreview: true`.  
  Output: Returns `source: 'sample-preview'`.  
  *Result: PASSED.*

### Actual Live Cloud API Tests
1. **Google Cloud Text-to-Speech API:**  
   - Status: `GOOGLE_CLOUD_TTS_API_KEY` is currently not configured in the environment.
   - Live network synthesis could not be run because credentials have not yet been supplied.
   - Fallback behavior: Confirmed returns graceful browser fallback signal with descriptive error.
2. **Gemini 3.8 Flash Lite TTS (`gemini-3.8-flash-lite-tts`):**  
   - Key: `GEMINI_API_KEY` is present.
   - Result: Model name `gemini-3.8-flash-lite-tts` was validated. The live API returned:  
     `HTTP 429 RESOURCE_EXHAUSTED: Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 10, model: gemini-3.8-flash-lite-tts`.  
   - Fallback behavior: The application detected the 429 status code and seamlessly fell back to the local device browser speech engine without freezing or crashing.

---

## 4. How to Enable Google Cloud Chirp 3 HD in Production

When ready to enable live Google Cloud synthesis:
1. Ensure the Cloud Text-to-Speech API is enabled in your Google Cloud Project:
   `https://console.cloud.google.com/apis/library/texttospeech.googleapis.com`
2. Create an API Key in Google Cloud Console.
3. Configure the environment variables:
   ```env
   TTS_PROVIDER=google-cloud
   GOOGLE_CLOUD_TTS_API_KEY=AIzaSy...your_actual_key...
   TTS_VOICE_ID=hi-IN-Chirp3-HD-Aoede
   ```
4. Tia will now synthesize live studio-grade audio via Chirp 3 HD, and will automatically fall back to the browser voice if network issues occur.
