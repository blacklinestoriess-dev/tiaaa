/**
 * server/queryRouter.ts
 *
 * HIGH-PERFORMANCE QUERY ROUTER FOR TIA ASSISTANT
 *
 * Implements the mandatory routing architecture:
 *
 *        FAST ROUTER (< 2ms)
 *               ↓
 *  ┌────────────┬────────────┬────────────┐
 *  │            │            │            │
 * CASUAL     STATIC         TOOL        LIVE
 *  │            │            │            │
 *  ↓            ↓            ↓            ↓
 * DIRECT     DIRECT       TARGETED    TARGETED
 * MODEL      MODEL          TOOL     GROUNDING /
 * (0 tools,  (0 tools,    (weather/   CACHED REUSE
 *  0 search)  0 search)    memory)     (min calls)
 *  │            │            │            │
 *  └────────────┴────────────┴────────────┘
 *               ↓
 *        PRISTINE RESPONSE
 */

export type QueryRoute = 'CASUAL' | 'STATIC' | 'TOOL' | 'LIVE';

export interface RouteDecision {
  route: QueryRoute;
  reason: string;
  isExplicitVerification: boolean;
  toolType?: 'weather' | 'memory';
  targetLocation?: string;
  isSportsRelated?: boolean;
}

// 1. Explicit verification keywords (Overrides speed for guaranteed accuracy)
const EXPLICIT_VERIFY_PATTERNS = [
  /check\s*(karke|karo|kar|kijiye|again)/i,
  /verify\s*(karke|karo|kar|kijiye|again)/i,
  /official\s*(source|website|site)/i,
  /latest\s*(information|update|data|batao|khabar)/i,
  /pakka\s*(batao|hai|\?)/i,
  /sure\s*ho(\?|\b)/i,
  /recheck/i,
  /sahi\s*batao/i,
  /dobara\s*(check|dekho)/i,
  /phir\s*se\s*(check|dekho)/i,
];

// 2. Greetings and common conversational small-talk
const GREETING_EXACT_OR_START = [
  /^(hi|hello|hey|heyy|namaste|namaskar|pranam|kem cho|kasa kay|salaam|sasriyakaal)[\s!.,?]*$/i,
  /^(hi|hello|hey)\s+(tia|diya|tiya|boss|dost|yaar)[\s!.,?]*$/i,
  /^(good\s*(morning|afternoon|evening|night|day))[\s!.,?]*$/i,
  /^(bye|goodbye|see\s*you|alvida|tata|chalta\s*hoon|chalti\s*hoon)[\s!.,?]*$/i,
  /^(kya\s*haal|kaise\s*ho|kaisi\s*ho|kaisa\s*hai|how\s*are\s*you|sab\s*badhiya|sab\s*theek)[\s!.,?]*$/i,
];

// 3. Chit-chat & Small Talk queries (NOT asking for external live facts)
const CASUAL_CHITCHAT_PATTERNS = [
  /^(kya\s*kar\s*rahi\s*ho|what\s*are\s*you\s*doing|kya\s*chal\s*raha\s*hai|sup|whats\s*up)[\s!.,?]*$/i,
  /^(mere\s*se\s*baat\s*karo|baat\s*karo|thodi\s*baat\s*karo|chitchat\s*karo|kuch\s*bolo)[\s!.,?]*$/i,
  /^(aaj\s*kya\s*karu|bore\s*ho\s*raha|bored\s*hoon|mann\s*nahi\s*lag\s*raha|mood\s*off)[\s!.,?]*$/i,
  /^(tum\s*kaun\s*ho|who\s*are\s*you|apne\s*baare\s*mein\s*batao|introduce\s*yourself|tell\s*me\s*about\s*yourself)[\s!.,?]*$/i,
  /^(tum\s*funny\s*ho|you\s*are\s*funny|you\s*are\s*(cute|smart|great|awesome|best)|tum\s*(cute|smart|mast)\s*ho)[\s!.,?]*$/i,
  /^(i\s*love\s*you|love\s*you|love\s*u|dost\s*banogi|be\s*my\s*friend)[\s!.,?]*$/i,
  /^(khana\s*khaya|dinner\s*kiya|lunch\s*kiya|so\s*gayi|uth\s*gayi)[\s!.,?]*$/i,
  /^(aur\s*batao|kuch\s*naya\s*batao|kuch\s*bhi\s*bolo)[\s!.,?]*$/i,
];

// 4. Creative requests (Jokes, Poems, Stories)
const CREATIVE_JOKE_PATTERNS = [
  /\b(ek\s*joke|joke\s*sunao|chutkula|tell\s*me\s*a\s*joke|hasao|funny\s*joke|shayari|poem|kahani|story)\b/i,
];

// 5. Short conversational reactions & acknowledgments
const CASUAL_REACTIONS = new Set([
  'accha', 'achha', 'acha', 'theek hai', 'thik hai', 'okay', 'ok', 'okay okay', 'okk',
  'hmm', 'hmmm', 'haan', 'ha', 'haa', 'nahi', 'no', 'nope', 'yep', 'yeah', 'yes',
  'haha', 'hahaha', 'hahahaha', 'lol', 'lmao', 'rofl', 'sahi hai', 'badhiya', 'mast',
  'superb', 'great', 'nice', 'cool', 'kuch nahi', 'nothing', 'chalo', 'done',
  'thank you', 'thanks', 'dhanyawad', 'shukriya', 'welcome', 'anytime',
]);

// 6. Casual opinion/preference questions (asking Tia's personal likes, NOT scores/stats)
const CASUAL_OPINION_PATTERNS = [
  /^(waise\s*)?(tumhe|tumko|aapko)\s*(cricket|football|sports|movies|music|food)\s*pasand\s*hai\??$/i,
  /^(do\s*you\s*like)\s*(cricket|sports|music|movies)\??$/i,
  /^(tumhara|aapka)\s*favorite\s*(color|player|movie|song|food)\s*(kya|kaun)\s*hai\??$/i,
  /^(what\s*is\s*your\s*favorite)\s*(color|movie|song|hobby)\??$/i,
];

// 7. Memory manipulation commands (TOOL route)
const MEMORY_COMMAND_PATTERNS = [
  /\b(remember\s+that|yaad\s+rakhna\s+(ki)?|note\s+down\s+that|note\s+that)\b/i,
  /\b(forget\s+that|remove\s+that\s+memory|delete\s+that\s+memory|bhool\s+jao\s+(ki)?)\b/i,
];

// 8. Live weather intent (TOOL route)
const WEATHER_INQUIRY_PATTERNS = [
  /\b(weather|mausam|temperature|taapmaan|rain|barish|forecast|climate)\b/i,
];

// Non-tool conceptual questions about weather/nature (STATIC, not live weather)
const STATIC_WEATHER_PATTERNS = [
  /\b(weather|mausam|monsoon|rain|barish)\s*(kya\s*hai|kya\s*hota\s*hai|kaise\s*banta\s*hai|meaning|definition)\b/i,
  /\b(what\s*is|define|how\s*does)\s*(weather|monsoon|rain|climate|global\s*warming)\b/i,
];

// 9. Static definitions / evergreen knowledge (STATIC route)
const STATIC_DEFINITION_PATTERNS = [
  /\b(kya\s*hai|kya\s*hota\s*hai|kya\s*hoti\s*hai|kisne\s*banaya|kisne\s*likha|kaun\s*the|kaun\s*tha)\b/i,
  /\b(what\s*is|what\s*are|define|explain|who\s*was|who\s*invented|who\s*discovered)\b/i,
  /\b(capital\s*of|capital\s*kya\s*hai|rajdhani\s*kya\s*hai|speed\s*of\s*light|photosynthesis|gravity|dna|rna|cpu|ram|html|css|javascript|python|quantum|black\s*hole|solar\s*system|earth|constitution)\b/i,
];

// Static sports questions (rules, evergreen players, history)
const STATIC_SPORTS_PATTERNS = [
  /\b(cricket|football|hockey|tennis)\s*(kya\s*hai|kya\s*hota\s*hai|meaning)\b/i,
  /\b(cricket\s*mein\s*(wicket|over|run|pitch|lbw)\s*(kya|kaise))\b/i,
  /\b(virat\s*kohli|sachin\s*tendulkar|ms\s*dhoni|rohit\s*sharma|kapil\s*dev)\s*(kaun\s*hai|kaun\s*hain)\b/i,
  /\b(who\s*is)\s*(virat\s*kohli|sachin\s*tendulkar|ms\s*dhoni)\b/i,
  /\b(how\s*many\s*players\s*in\s*cricket|cricket\s*mein\s*kitne\s*player)\b/i,
];

// 10. Temporal / Dynamic triggers (LIVE route)
const LIVE_TEMPORAL_PATTERNS = [
  /\b(aaj|today|abhi|now|current|currently|latest|taza|recent|recently|haal\s*hi\s*mein)\b/i,
  /\b(upcoming|agla|agle|next|kal|tomorrow|yesterday|beeta\s*kal)\b/i,
  /\b(schedule|fixture|fixtures|timing|dates|tarikh|samay|kab\s*hai|kahan\s*hoga|kahan\s*hua)\b/i,
  /\b(live\s*score|scorecard|match\s*score|score\s*kya|points\s*table|standings)\b/i,
  /\b(ranking|rankings|#1|no\s*1|number\s*1|top\s*\d+)\b/i,
  /\b(gold\s*medal|medals|medal\s*tally|highest\s*scorer|kitne\s*run|kitne\s*runs|kitne\s*gold)\b/i,
  /\b(brics|g20|asian\s*games|olympics|world\s*cup)\b/i,
  /\b(202[5-9]|17\s*sep|17\s*september|22\s*sep|22\s*september)\b/i,
];

/**
 * Fast Regex-Based Query Router.
 * Runs synchronously in < 2ms without network calls.
 */
export function routeUserQuery(
  userMessage: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }> = []
): RouteDecision {
  const text = (userMessage || '').trim();
  const lower = text.toLowerCase();

  // Strip trailing punctuation and extra whitespace for clean matching
  const normalized = lower.replace(/[!?.,;]+$/, '').trim();

  // Rule 0: Pure emoji string -> immediate CASUAL
  const emojiOnlyRegex = /^[\p{Emoji}\s]+$/u;
  if (emojiOnlyRegex.test(text) && !/[a-zA-Z0-9]/.test(text)) {
    return {
      route: 'CASUAL',
      reason: 'Emoji-only reaction',
      isExplicitVerification: false,
    };
  }

  // Rule 1: Explicit verification request (OVERRIDE - forces LIVE route)
  const isExplicitVerify = EXPLICIT_VERIFY_PATTERNS.some((p) => p.test(lower));
  if (isExplicitVerify) {
    return {
      route: 'LIVE',
      reason: 'User explicitly requested live verification/check',
      isExplicitVerification: true,
    };
  }

  // Rule 2: Memory actions (TOOL route)
  if (MEMORY_COMMAND_PATTERNS.some((p) => p.test(lower))) {
    return {
      route: 'TOOL',
      reason: 'Explicit memory persistence command',
      isExplicitVerification: false,
      toolType: 'memory',
    };
  }

  // Rule 3: Short conversational reaction or acknowledgment -> immediate CASUAL
  if (CASUAL_REACTIONS.has(normalized)) {
    return {
      route: 'CASUAL',
      reason: 'Conversational acknowledgment/reaction',
      isExplicitVerification: false,
    };
  }

  // Rule 4: Casual greetings & salutations -> immediate CASUAL
  if (GREETING_EXACT_OR_START.some((p) => p.test(normalized))) {
    return {
      route: 'CASUAL',
      reason: 'Standard greeting',
      isExplicitVerification: false,
    };
  }

  // Rule 5: Creative requests (Jokes, Chutkula, Shayari, etc.) -> immediate CASUAL
  if (CREATIVE_JOKE_PATTERNS.some((p) => p.test(normalized))) {
    return {
      route: 'CASUAL',
      reason: 'Creative humor/entertainment request',
      isExplicitVerification: false,
    };
  }

  // Rule 6: Chit-chat & Small Talk ("kya kar rahi ho", "mere se baat karo", etc.) -> immediate CASUAL
  if (CASUAL_CHITCHAT_PATTERNS.some((p) => p.test(normalized))) {
    return {
      route: 'CASUAL',
      reason: 'Casual conversation / chit-chat',
      isExplicitVerification: false,
    };
  }

  // Rule 7: Casual personal opinion about Tia ("waise tumhe cricket pasand hai?", etc.) -> immediate CASUAL
  if (CASUAL_OPINION_PATTERNS.some((p) => p.test(normalized))) {
    return {
      route: 'CASUAL',
      reason: 'Casual conversational preference question',
      isExplicitVerification: false,
    };
  }

  // Rule 8: Weather inquiry
  if (WEATHER_INQUIRY_PATTERNS.some((p) => p.test(lower))) {
    // Check if it is a static definition query ("weather kya hota hai?", "monsoon kya hai?")
    if (STATIC_WEATHER_PATTERNS.some((p) => p.test(lower))) {
      return {
        route: 'STATIC',
        reason: 'Static educational question about weather/climate',
        isExplicitVerification: false,
      };
    }

    // Extract location hint if mentioned
    let loc = '';
    const cityMatch = lower.match(/\b(in|of|mein|ka|ke|city)?\s*([a-zA-Z]+)\s*(ka|mein|weather|temperature|taapmaan)/i);
    if (cityMatch && cityMatch[2] && cityMatch[2].length > 2) {
      loc = cityMatch[2].trim();
    }

    return {
      route: 'TOOL',
      reason: 'Live weather query',
      isExplicitVerification: false,
      toolType: 'weather',
      targetLocation: loc || undefined,
    };
  }

  // Rule 9: Static sports questions ("cricket kya hai", "virat kohli kaun hai", rules) -> STATIC
  if (STATIC_SPORTS_PATTERNS.some((p) => p.test(lower))) {
    return {
      route: 'STATIC',
      reason: 'Static sports knowledge/biography',
      isExplicitVerification: false,
      isSportsRelated: true,
    };
  }

  // Rule 10: Dynamic/temporal/current cues -> LIVE
  const hasLiveCues = LIVE_TEMPORAL_PATTERNS.some((p) => p.test(lower));
  if (hasLiveCues) {
    const isSports = /\b(cricket|match|score|bowler|batter|batsman|ranking|squad|icc|bcci|t20|odi|test|asian\s*games)\b/i.test(lower);
    return {
      route: 'LIVE',
      reason: 'Time-sensitive or dynamic query',
      isExplicitVerification: false,
      isSportsRelated: isSports,
    };
  }

  // Rule 11: Static evergreen definitions ("photosynthesis kya hai", "india ki capital", "gravity kya hai") -> STATIC
  if (STATIC_DEFINITION_PATTERNS.some((p) => p.test(lower))) {
    return {
      route: 'STATIC',
      reason: 'Static general knowledge definition or fact',
      isExplicitVerification: false,
    };
  }

  // Rule 12: Contextual follow-ups based on conversation history
  // If the query is short (e.g. "score kya tha?", "kitne runs se?", "kaun jeeta?", "highest scorer?")
  const isShortQuery = text.split(/\s+/).length <= 6;
  if (isShortQuery) {
    const hasFollowUpKeyword = /\b(score|run|runs|kitne|highest|winner|jeeta|kahan|kab|who|when|where|agla|agle)\b/i.test(lower);
    if (hasFollowUpKeyword) {
      return {
        route: 'LIVE',
        reason: 'Short contextual follow-up to dynamic topic',
        isExplicitVerification: false,
        isSportsRelated: true,
      };
    }

    // Short generic question without temporal cues defaults to CASUAL
    return {
      route: 'CASUAL',
      reason: 'Short conversational turn',
      isExplicitVerification: false,
    };
  }

  // Default: Treat standard conversational questions as CASUAL (Fast Model) to avoid unnecessary search overhead
  return {
    route: 'CASUAL',
    reason: 'Standard conversational question without live triggers',
    isExplicitVerification: false,
  };
}
