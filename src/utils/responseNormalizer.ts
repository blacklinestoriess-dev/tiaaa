/**
 * src/utils/responseNormalizer.ts
 *
 * Canonical Assistant Response Normalizer for Tia.
 * Ensures that ANY response from the backend/Gemini/database/cache is completely
 * normalized into a clean, human-readable plain string before reaching:
 * - chat UI
 * - chat history
 * - TTS
 * - follow-up context
 *
 * Strictly prevents raw JSON, double-encoded JSON, truncated JSON, wrapper fragments,
 * or markdown code blocks from ever being shown to the user or spoken aloud.
 */

export interface NormalizedAssistantPayload {
  reply: string;
  emotion?: string;
  detectedLanguage?: string;
  contextType?: string;
  suggestedVoiceGender?: string;
}

/**
 * Robustly recovers clean text content from partial/malformed/truncated JSON.
 * Example inputs:
 *   '{"reply":"Boss, Asian Games 2026 toh full swing mein hai...'
 *   '{"reply":"Oho boss, ekdum ta'
 *   '{"text":"India won...'
 */
export function extractTextFromMalformedJson(input: string): string {
  if (!input || typeof input !== 'string') return '';
  const trimmed = input.trim();

  // Try standard JSON.parse first if it looks like an object
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === 'string') return extractTextFromMalformedJson(parsed);
      if (parsed && typeof parsed === 'object') {
        const val = parsed.reply || parsed.text || parsed.message || parsed.content || parsed.answer;
        if (typeof val === 'string' && val.trim()) {
          return extractTextFromMalformedJson(val);
        }
      }
    } catch {
      // Not valid closed JSON; proceed to pattern extraction
    }
  }

  // Handle truncated or unclosed JSON starting with {"reply": or {"text": etc.
  const replyKeyMatch = trimmed.match(
    /^\s*\{\s*["'](?:reply|text|message|content|answer)["']\s*:\s*(["']?)([\s\S]*)$/i
  );
  if (replyKeyMatch) {
    let content = replyKeyMatch[2] || '';
    const quoteChar = replyKeyMatch[1];

    if (quoteChar) {
      // Find the closing unescaped quote if present
      let endIdx = -1;
      let escaped = false;
      for (let i = 0; i < content.length; i++) {
        const ch = content[i];
        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === '\\') {
          escaped = true;
          continue;
        }
        if (ch === quoteChar) {
          endIdx = i;
          break;
        }
      }
      if (endIdx !== -1) {
        content = content.slice(0, endIdx);
      } else {
        // Truncated string without closing quote: strip trailing unescaped backslash or closing braces
        content = content.replace(/\\$/, '').replace(/["'}\s]+$/, '');
      }
    } else {
      // No quote: strip trailing braces/commas
      content = content.replace(/["'}\s]+$/, '');
    }

    // Unescape common JSON escape sequences (\n, \", \\, \t)
    try {
      content = JSON.parse(`"${content.replace(/"/g, '\\"').replace(/\\"/g, '"')}"`);
    } catch {
      content = content
        .replace(/\\"/g, '"')
        .replace(/\\'/g, "'")
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '')
        .replace(/\\t/g, ' ')
        .replace(/\\\\/g, '\\');
    }

    return content.trim();
  }

  // Regex fallback: check if raw text contains {"reply":"..."} anywhere inside it
  const embeddedReplyMatch = trimmed.match(/["'](?:reply|text)["']\s*:\s*"((?:[^"\\]|\\.)*)/i);
  if (embeddedReplyMatch && embeddedReplyMatch[1]) {
    try {
      return JSON.parse(`"${embeddedReplyMatch[1]}"`).trim();
    } catch {
      return embeddedReplyMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n').trim();
    }
  }

  // Clean away markdown wrappers if present
  let cleaned = trimmed
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  // If text starts with { or {" after stripping, remove opening bracket fragments
  cleaned = cleaned.replace(/^\{\s*["']?[a-zA-Z0-9_]*["']?\s*:\s*["']?/, '');
  cleaned = cleaned.replace(/["'}\s]+$/, '');

  return cleaned.trim();
}

/**
 * CANONICAL NORMALIZER:
 * Converts any response format (object, JSON string, double-encoded string, plain text, null/undefined)
 * into a pristine plain string.
 */
export function normalizeAssistantResponse(response: unknown): string {
  if (response === null || response === undefined) {
    return '';
  }

  // If already an object
  if (typeof response === 'object') {
    const obj = response as Record<string, any>;
    const rawVal = obj.reply || obj.text || obj.message || obj.content || obj.answer;
    if (typeof rawVal === 'string') {
      return normalizeAssistantResponse(rawVal);
    }
    if (typeof rawVal === 'object' && rawVal !== null) {
      return normalizeAssistantResponse(rawVal);
    }
  }

  // If string
  if (typeof response === 'string') {
    let str = response.trim();
    if (!str) return '';

    // Strip markdown code fences if wrapped
    if (str.startsWith('```json') || str.startsWith('```')) {
      str = str.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    }

    // Attempt to parse JSON string (handles single or double encoded JSON)
    let parsedCount = 0;
    while (
      typeof str === 'string' &&
      str.trim().startsWith('{') &&
      str.trim().endsWith('}') &&
      parsedCount < 3
    ) {
      try {
        const parsed = JSON.parse(str.trim());
        parsedCount++;
        if (typeof parsed === 'string') {
          str = parsed.trim();
        } else if (parsed && typeof parsed === 'object') {
          const innerVal =
            parsed.reply || parsed.text || parsed.message || parsed.content || parsed.answer;
          if (typeof innerVal === 'string') {
            str = innerVal.trim();
          } else {
            break;
          }
        } else {
          break;
        }
      } catch {
        break;
      }
    }

    // Check if string still has malformed JSON structure or starts with {"reply"
    if (
      /^\s*\{\s*["'](?:reply|text|message|content)["']/i.test(str) ||
      str.includes('"reply":') ||
      str.includes('"text":')
    ) {
      const recovered = extractTextFromMalformedJson(str);
      if (recovered) {
        str = recovered;
      }
    }

    // Final clean-up: remove any residual leading {"reply": or trailing quotes/braces
    str = str
      .replace(/^\s*\{\s*["'](?:reply|text)["']\s*:\s*["']?/i, '')
      .replace(/["'}\s]+$/, '')
      .trim();

    // Clean markdown bold/bullets if they look like raw JSON remnants
    str = str.replace(/^"|"$/g, '').trim();

    return str;
  }

  return String(response).trim();
}

/**
 * Validates whether the normalized response is complete and acceptable.
 * Returns false if the text is empty, just a brace, or a truncated JSON remnant.
 */
export function isValidAssistantResponse(text: string | null | undefined): boolean {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (trimmed.length < 2) return false;
  if (
    trimmed === '{' ||
    trimmed === '{}' ||
    trimmed === '{"reply":' ||
    trimmed === '{"reply":""}' ||
    trimmed === '{"text":'
  ) {
    return false;
  }
  // Check if string is only unclosed JSON syntax
  if (/^\{\s*["'](?:reply|text)["']\s*:?\s*$/i.test(trimmed)) {
    return false;
  }
  return true;
}

/**
 * Fallback friendly message for Tia when retry fails
 */
export const TIA_FALLBACK_GLITCH_MESSAGE =
  'Boss, response thoda glitch ho gaya 😅 Ek baar phir poochho.';
