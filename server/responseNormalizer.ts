/**
 * server/responseNormalizer.ts
 *
 * Canonical Assistant Response Normalizer for Server-Side Use in Tia.
 * Guarantees that any Gemini output (valid JSON, malformed JSON, unclosed quotes,
 * plain text, markdown code blocks) is extracted cleanly into plain human text
 * BEFORE being returned in API payloads or persisted to database conversations.
 */

export interface ParsedAssistantPayload {
  reply: string;
  emotion: string;
  detectedLanguage: string;
  contextType: string;
  suggestedVoiceGender: string;
  memoryAction: {
    action: string;
    field?: string;
    value?: string;
    fact?: string;
  };
}

/**
 * Extracts pure conversational text from truncated or unclosed JSON strings.
 */
export function extractTextFromMalformedJson(input: string): string {
  if (!input || typeof input !== 'string') return '';
  const trimmed = input.trim();

  // 1. Try standard JSON.parse first if it starts and ends with braces
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
      // Not valid closed JSON; fall through to pattern extraction
    }
  }

  // 2. Pattern: starts with {"reply": or {"text": etc.
  const replyKeyMatch = trimmed.match(
    /^\s*\{\s*["'](?:reply|text|message|content|answer)["']\s*:\s*(["']?)([\s\S]*)$/i
  );
  if (replyKeyMatch) {
    let content = replyKeyMatch[2] || '';
    const quoteChar = replyKeyMatch[1];

    if (quoteChar) {
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
        content = content.replace(/\\$/, '').replace(/["'}\s]+$/, '');
      }
    } else {
      content = content.replace(/["'}\s]+$/, '');
    }

    // Unescape common JSON escapes
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

  // 3. Embedded reply match
  const embeddedReplyMatch = trimmed.match(/["'](?:reply|text)["']\s*:\s*"((?:[^"\\]|\\.)*)/i);
  if (embeddedReplyMatch && embeddedReplyMatch[1]) {
    try {
      return JSON.parse(`"${embeddedReplyMatch[1]}"`).trim();
    } catch {
      return embeddedReplyMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n').trim();
    }
  }

  // 4. Strip markdown code fences and brackets
  let cleaned = trimmed
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  cleaned = cleaned.replace(/^\{\s*["']?[a-zA-Z0-9_]*["']?\s*:\s*["']?/, '');
  cleaned = cleaned.replace(/["'}\s]+$/, '');

  return cleaned.trim();
}

/**
 * Normalizes any response into a clean plain text string without any JSON wrappers.
 */
export function normalizeAssistantResponse(response: unknown): string {
  if (response === null || response === undefined) {
    return '';
  }

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

  if (typeof response === 'string') {
    let str = response.trim();
    if (!str) return '';

    if (str.startsWith('```json') || str.startsWith('```')) {
      str = str.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    }

    // Parse potential JSON layers
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

    str = str
      .replace(/^\s*\{\s*["'](?:reply|text)["']\s*:\s*["']?/i, '')
      .replace(/["'}\s]+$/, '')
      .trim();

    str = str.replace(/^"|"$/g, '').trim();

    return str;
  }

  return String(response).trim();
}

/**
 * Checks if a response string is valid and complete.
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
  if (/^\{\s*["'](?:reply|text)["']\s*:?\s*$/i.test(trimmed)) {
    return false;
  }
  return true;
}

/**
 * Parses Gemini raw assistant output into a structured response,
 * ensuring the reply property is ALWAYS cleanly normalized plain text.
 */
export function parseAssistantResponse(rawText: string): ParsedAssistantPayload {
  let cleaned = (rawText || '').trim();

  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
  }

  let parsedObject: any = null;
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      parsedObject = JSON.parse(jsonMatch[0]);
    } catch {
      // Partial or broken JSON
    }
  }

  if (!parsedObject) {
    try {
      parsedObject = JSON.parse(cleaned);
    } catch {
      // Not JSON
    }
  }

  if (parsedObject && typeof parsedObject === 'object') {
    const rawReply = parsedObject.reply || parsedObject.text || parsedObject.message || '';
    const cleanReply = normalizeAssistantResponse(rawReply);

    return {
      reply: cleanReply || 'Haan boss, sun rahi hoon! Kuch poochna tha?',
      emotion: parsedObject.emotion || 'playful',
      detectedLanguage: parsedObject.detectedLanguage || 'hinglish',
      contextType: parsedObject.contextType || 'chat',
      suggestedVoiceGender: parsedObject.suggestedVoiceGender || 'female',
      memoryAction: parsedObject.memoryAction || { action: 'none' },
    };
  }

  // Not parseable as JSON directly (could be truncated JSON like '{"reply":"Oho boss, ekdum ta')
  const recovered = normalizeAssistantResponse(rawText);
  const sanitized = recovered
    .replace(/[\*\#\`\_]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    reply: sanitized || 'Haan boss, sun rahi hoon! Kuch poochna tha?',
    emotion: 'playful',
    detectedLanguage: 'hinglish',
    contextType: 'chat',
    suggestedVoiceGender: 'female',
    memoryAction: { action: 'none' },
  };
}
