import type {
  SpeechVoiceOption,
  TiaEmotion,
  VoiceSelectionCriteria,
} from '../types';
import { normalizeAssistantResponse } from '../utils/responseNormalizer';

/**
 * Acoustic prosody profiles for each emotion.
 * Controls pitch, speaking rate, inter-clause pause duration, and volume.
 */
export interface EmotionProsody {
  pitch: number;
  rateMultiplier: number;
  pauseDurationMs: number;
  volume: number;
}

export const EMOTION_PROSODY_MAP: Record<TiaEmotion, EmotionProsody> = {
  playful: {
    pitch: 1.15,
    rateMultiplier: 1.05,
    pauseDurationMs: 240,
    volume: 1.0,
  },
  funny: {
    pitch: 1.14,
    rateMultiplier: 1.06,
    pauseDurationMs: 260,
    volume: 1.0,
  },
  happy: {
    pitch: 1.16,
    rateMultiplier: 1.04,
    pauseDurationMs: 200,
    volume: 1.0,
  },
  excited: {
    pitch: 1.22,
    rateMultiplier: 1.12,
    pauseDurationMs: 160,
    volume: 1.0,
  },
  curious: {
    pitch: 1.08,
    rateMultiplier: 1.0,
    pauseDurationMs: 220,
    volume: 1.0,
  },
  calm: {
    pitch: 0.98,
    rateMultiplier: 0.92,
    pauseDurationMs: 320,
    volume: 0.95,
  },
  reassuring: {
    pitch: 0.96,
    rateMultiplier: 0.90,
    pauseDurationMs: 300,
    volume: 0.95,
  },
  empathetic: {
    pitch: 0.95,
    rateMultiplier: 0.88,
    pauseDurationMs: 340,
    volume: 0.95,
  },
  serious: {
    pitch: 0.92,
    rateMultiplier: 0.92,
    pauseDurationMs: 350,
    volume: 1.0,
  },
  neutral: {
    pitch: 1.02,
    rateMultiplier: 1.0,
    pauseDurationMs: 200,
    volume: 1.0,
  },
};

/**
 * Visual metadata for Tia's emotions (badges, colors, emojis)
 */
export interface EmotionVisualMeta {
  label: string;
  emoji: string;
  badgeClass: string;
  orbGlow: string;
}

export function getEmotionVisualMeta(emotion: string = 'neutral'): EmotionVisualMeta {
  switch (emotion) {
    case 'playful':
      return {
        label: 'Playful',
        emoji: '🎭',
        badgeClass: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
        orbGlow: 'from-rose-500/40 via-pink-500/30 to-purple-600/30',
      };
    case 'funny':
      return {
        label: 'Witty',
        emoji: '😂',
        badgeClass: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
        orbGlow: 'from-amber-500/40 via-orange-500/30 to-yellow-500/30',
      };
    case 'happy':
      return {
        label: 'Cheerful',
        emoji: '✨',
        badgeClass: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
        orbGlow: 'from-yellow-400/40 via-amber-500/30 to-orange-500/30',
      };
    case 'excited':
      return {
        label: 'Excited',
        emoji: '🚀',
        badgeClass: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
        orbGlow: 'from-orange-500/50 via-rose-500/40 to-yellow-400/30',
      };
    case 'curious':
      return {
        label: 'Curious',
        emoji: '🤔',
        badgeClass: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
        orbGlow: 'from-indigo-500/40 via-blue-500/30 to-violet-500/30',
      };
    case 'calm':
      return {
        label: 'Calm',
        emoji: '🌿',
        badgeClass: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
        orbGlow: 'from-emerald-500/40 via-teal-500/30 to-cyan-500/30',
      };
    case 'reassuring':
      return {
        label: 'Reassuring',
        emoji: '🤝',
        badgeClass: 'bg-teal-500/15 text-teal-400 border-teal-500/30',
        orbGlow: 'from-teal-500/40 via-emerald-500/30 to-cyan-600/30',
      };
    case 'empathetic':
      return {
        label: 'Empathetic',
        emoji: '💙',
        badgeClass: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
        orbGlow: 'from-sky-500/40 via-blue-500/30 to-indigo-500/30',
      };
    case 'serious':
      return {
        label: 'Focused',
        emoji: '🛡️',
        badgeClass: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
        orbGlow: 'from-slate-500/40 via-blue-900/30 to-indigo-900/30',
      };
    case 'neutral':
    default:
      return {
        label: 'Friendly',
        emoji: '💬',
        badgeClass: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
        orbGlow: 'from-purple-500/40 via-indigo-500/30 to-pink-500/30',
      };
  }
}

/**
 * TTS-only normalization layer for decimal numbers, units, and symbols.
 * Converts e.g.:
 * - 30.9 → "30 point 9"
 * - 31.5 → "31 point 5"
 * - 98.6 → "98 point 6"
 * - 2.75 → "2 point 75"
 * - -2.5 → "-2 point 5"
 * - 30.9°C → "30 point 9 degrees Celsius"
 *
 * Rules:
 * - Does NOT replace "." full stops in normal sentences (preserved for natural pauses)
 * - Decimal numbers are matched with strict boundary protection so dates (e.g. 16.09.2026),
 *   IP addresses, URLs, and email addresses are NOT broken.
 * - Supports negative decimals (-2.5) and multiple decimal numbers in the same string.
 * - This normalization is strictly applied to speech synthesis audio generation only;
 *   the visual chat UI displays the original un-altered response.
 */
export function normalizeDecimalsForSpeech(text: string): string {
  if (!text) return '';

  const isHindi = hasDevanagariScript(text);

  let normalized = text;
  if (isHindi) {
    normalized = normalized
      .replace(/℃/g, ' डिग्री सेल्सियस')
      .replace(/℉/g, ' डिग्री फारेनहाइट')
      .replace(/°\s*C\b/gi, ' डिग्री सेल्सियस')
      .replace(/°\s*F\b/gi, ' डिग्री फारेनहाइट')
      .replace(/°(?!\w)/g, ' डिग्री');
  } else {
    normalized = normalized
      .replace(/℃/g, ' degrees Celsius')
      .replace(/℉/g, ' degrees Fahrenheit')
      .replace(/°\s*C\b/gi, ' degrees Celsius')
      .replace(/°\s*F\b/gi, ' degrees Fahrenheit')
      .replace(/°(?!\w)/g, ' degrees');
  }

  // Convert decimal numbers (with optional negative sign) to "point" notation for smooth speech flow.
  // Lookbehind ensures not preceded by digit+dot, letters, or url/email characters.
  // Lookahead ensures not followed by dot+digit (like in dates or version numbers) or letters.
  normalized = normalized.replace(
    /(?<!\d\.)(?<![a-zA-Z0-9_@\/-])(-?\d+)\.(\d+)(?!\.\d)(?![a-zA-Z0-9_@])/g,
    isHindi ? '$1 पॉइंट $2' : '$1 point $2'
  );

  return normalized;
}

/**
 * Mapping of high-frequency Roman Hindi/Hinglish vocabulary and conversational loanwords
 * to unambiguous Devanagari script for speech synthesis.
 */
export const HINDI_ROMAN_TO_DEVANAGARI: Record<string, string> = {
  // Pronouns & Demonstratives
  main: 'मैं',
  mai: 'मैं',
  hum: 'हम',
  ham: 'हम',
  tum: 'तुम',
  aap: 'आप',
  tu: 'तू',
  mera: 'मेरा',
  meri: 'मेरी',
  mere: 'मेरे',
  tera: 'तेरा',
  teri: 'तेरी',
  tere: 'तेरे',
  hamara: 'हमारा',
  humara: 'हमारा',
  hamari: 'हमारी',
  humari: 'हमारी',
  hamare: 'हमारे',
  humare: 'हमारे',
  tumhara: 'तुम्हारा',
  tumhari: 'तुम्हारी',
  tumhare: 'तुम्हारे',
  aapka: 'आपका',
  aapki: 'आपकी',
  aapke: 'आपके',
  apna: 'अपना',
  apni: 'अपनी',
  apne: 'अपने',
  mujhe: 'मुझे',
  mujhko: 'मुझको',
  humein: 'हमें',
  hamein: 'हमें',
  tumhe: 'तुम्हें',
  tumhein: 'तुम्हें',
  aapko: 'आपको',
  usse: 'उससे',
  usko: 'उसको',
  unhe: 'उन्हें',
  unhein: 'उन्हें',
  unko: 'उनको',
  isse: 'इससे',
  isko: 'इसको',
  inhe: 'इन्हें',
  inko: 'इनको',
  kise: 'किसे',
  kisko: 'किसको',
  kisne: 'किसने',
  jisne: 'जिसने',
  isne: 'इसने',
  usne: 'उसने',
  unhone: 'उन्होंने',
  inhone: 'इन्होंने',
  maine: 'मैंने',
  humne: 'हमने',
  tumne: 'तुमने',
  aapne: 'आपने',
  ye: 'ये',
  yeh: 'ये',
  wo: 'वो',
  woh: 'वो',
  iska: 'इसका',
  iski: 'इसकी',
  iske: 'इसके',
  uska: 'उसका',
  uski: 'उसकी',
  uske: 'उसके',
  inka: 'इनका',
  inki: 'इनकी',
  inke: 'इनके',
  unka: 'उनका',
  unki: 'उनकी',
  unke: 'उनके',
  kiska: 'किसका',
  kiski: 'किसकी',
  kiske: 'किसके',
  jiska: 'जिसका',
  jiski: 'जिसकी',
  jiske: 'जिसके',
  sab: 'सब',
  sabko: 'सबको',
  sabhi: 'सभी',
  sabka: 'सबका',
  sabki: 'सबकी',
  sabke: 'सबके',
  koi: 'कोई',
  kuch: 'कुछ',
  kuchh: 'कुछ',
  kisi: 'किसी',

  // Postpositions
  mein: 'में',
  se: 'से',
  ko: 'को',
  ka: 'का',
  ke: 'के',
  ki: 'की',
  tak: 'तक',
  liye: 'लिए',
  par: 'पर',
  pe: 'पे',
  baare: 'बारे',
  bina: 'बिना',
  paas: 'पास',
  saath: 'साथ',
  sath: 'साथ',
  door: 'दूर',

  // Auxiliary Verbs / Copulas
  hai: 'है',
  hain: 'हैं',
  hoon: 'हूँ',
  hun: 'हूँ',
  ho: 'हो',
  tha: 'था',
  thi: 'थी',
  hoga: 'होगा',
  hogi: 'होगी',
  hoge: 'होगे',
  honge: 'होंगे',
  hota: 'होता',
  hoti: 'होती',
  hote: 'होते',
  chahiye: 'चाहिए',
  sakti: 'सकती',
  sakta: 'सकता',
  sakte: 'सकते',

  // Verbs
  aa: 'आ',
  aao: 'आओ',
  aaye: 'आए',
  aayi: 'आई',
  aaya: 'आया',
  aati: 'आती',
  aata: 'आता',
  aate: 'आते',
  aana: 'आना',
  ja: 'जा',
  jao: 'जाओ',
  jaao: 'जाओ',
  gaya: 'गया',
  gayi: 'गई',
  gaye: 'गए',
  jaata: 'जाता',
  jaati: 'जाती',
  jaate: 'जाते',
  jaana: 'जाना',
  raha: 'रहा',
  rahi: 'रही',
  rahe: 'रहे',
  rahega: 'रहेगा',
  rahegi: 'रहेगी',
  rahenge: 'रहेंगे',
  kar: 'कर',
  karo: 'करो',
  karein: 'करें',
  karenge: 'करेंगे',
  karega: 'करेगा',
  karegi: 'करेगी',
  karta: 'करता',
  karti: 'करती',
  karte: 'करते',
  karna: 'करना',
  kiya: 'किया',
  kiye: 'किए',
  karke: 'करके',
  bol: 'बोल',
  bolo: 'बोलो',
  boliye: 'बोलिए',
  bolna: 'बोलना',
  bola: 'बोला',
  boli: 'बोली',
  bata: 'बता',
  batao: 'बताओ',
  bataiye: 'बताइए',
  batana: 'बताना',
  bataya: 'बताया',
  suno: 'सुनो',
  suniye: 'सुनिए',
  sun: 'सुन',
  dekho: 'देखो',
  dekhiye: 'देखिए',
  dekh: 'देख',
  dekha: 'देखा',
  chalo: 'चलो',
  chaliye: 'चलिए',
  chal: 'चल',
  chalte: 'चलते',
  chalti: 'चलती',
  chalta: 'चलता',
  le: 'ले',
  lo: 'लो',
  liya: 'लिया',
  de: 'दे',
  diya: 'दिया',
  diye: 'दिए',
  samajh: 'समझ',
  samjho: 'समझो',
  samjha: 'समझा',
  samjhi: 'समझी',
  socho: 'सोचो',
  socha: 'सोचा',
  poocho: 'पूछो',
  pucho: 'पूछो',
  ruko: 'रुको',
  ruk: 'रुक',
  baitho: 'बैठो',
  utho: 'उठो',
  khao: 'खाओ',
  piyo: 'पियो',

  // Adverbs, Conjunctions & Particles
  aaj: 'आज',
  kal: 'कल',
  parson: 'परसों',
  subah: 'सुबह',
  shaam: 'शाम',
  dopahar: 'दोपहर',
  raat: 'रात',
  din: 'दिन',
  abhi: 'अभी',
  kabhi: 'कभी',
  tabhi: 'तभी',
  jabhi: 'जभी',
  pehle: 'पहले',
  baad: 'बाद',
  jaldi: 'जल्दी',
  zyada: 'ज़्यादा',
  ziyada: 'ज़्यादा',
  kam: 'कम',
  thoda: 'थोड़ा',
  thode: 'थोड़े',
  thodi: 'थोड़ी',
  kaafi: 'काफ़ी',
  kafi: 'काफ़ी',
  bahut: 'बहुत',
  bohot: 'बहुत',
  bilkul: 'बिल्कुल',
  bas: 'बस',
  sirf: 'सिर्फ़',
  kewal: 'केवल',
  achha: 'अच्छा',
  accha: 'अच्छा',
  acha: 'अच्छा',
  achhi: 'अच्छी',
  acchi: 'अच्छी',
  achhe: 'अच्छे',
  acche: 'अच्छे',
  bura: 'बुरा',
  buri: 'बुरी',
  bure: 'बुरे',
  sahi: 'सही',
  galat: 'गलत',
  theek: 'ठीक',
  thik: 'ठीक',
  bhi: 'भी',
  toh: 'तो',
  na: 'ना',
  mat: 'मत',
  haan: 'हाँ',
  ha: 'हाँ',
  nahi: 'नहीं',
  nahin: 'नहीं',
  aur: 'और',
  ya: 'या',
  lekin: 'लेकिन',
  magar: 'मगर',
  kyonki: 'क्योंकि',
  kyunki: 'क्योंकि',
  isliye: 'इसलिए',
  agar: 'अगर',
  jab: 'जब',
  tab: 'तब',
  ab: 'अब',
  kab: 'कब',
  kahan: 'कहाँ',
  jahan: 'जहाँ',
  yahan: 'यहाँ',
  wahan: 'वहाँ',
  vahan: 'वहाँ',
  idhar: 'इधर',
  udhar: 'उधर',
  kidhar: 'किधर',
  aise: 'ऐसे',
  waise: 'वैसे',
  jaise: 'जैसे',
  kaise: 'कैसे',
  kitna: 'कितना',
  kitne: 'कितने',
  kitni: 'कितनी',
  itna: 'इतना',
  itne: 'इतने',
  itni: 'इतनी',
  utna: 'उतना',
  utne: 'उतने',
  utni: 'उतनी',
  kya: 'क्या',
  kyun: 'क्यों',
  kyu: 'क्यों',
  kaun: 'कौन',
  kon: 'कौन',
  kaunsa: 'कौनसा',
  konsa: 'कौनसा',
  sa: 'सा',
  si: 'सी',
  khud: 'खुद',

  // Conversational & Hinglish loanwords
  namaste: 'नमस्ते',
  pranam: 'प्रणाम',
  alvida: 'अलविदा',
  shukriya: 'शुक्रिया',
  dhanyavaad: 'धन्यवाद',
  dhanyawad: 'धन्यवाद',
  dost: 'दोस्त',
  doston: 'दोस्तों',
  dosto: 'दोस्तों',
  yaar: 'यार',
  bhai: 'भाई',
  behen: 'बहन',
  boss: 'बॉस',
  naam: 'नाम',
  kaam: 'काम',
  baat: 'बात',
  baatein: 'बातें',
  khabar: 'खबर',
  sawal: 'सवाल',
  jawab: 'जवाब',
  madad: 'मदद',
  zaroor: 'ज़रूर',
  zarur: 'ज़रूर',
  pata: 'पता',
  yaad: 'याद',
  samay: 'समय',
  waqt: 'वक़्त',
  saal: 'साल',
  mahina: 'महीना',
  mausam: 'मौसम',
  taapmaan: 'तापमान',
  barish: 'बारिश',
  baarish: 'बारिश',
  dhoop: 'धूप',
  hawa: 'हवा',
  badal: 'बादल',
  baadal: 'बादल',
  thand: 'ठंड',
  garmi: 'गर्मी',
  servers: 'सर्वर्स',
  server: 'सर्वर',
  busy: 'बिज़ी',
  kehna: 'कहना',
  faisla: 'फ़ैसला',
  happy: 'हैप्पी',
  mood: 'मूड',
  cricket: 'क्रिकेट',
  match: 'मैच',
  score: 'स्कोर',
  wicket: 'विकेट',
  run: 'रन',
  runs: 'रन',
  team: 'टीम',
  network: 'नेटवर्क',
  system: 'सिस्टम',
  update: 'अपडेट',
  status: 'स्टेटस',
  weather: 'वेदर',
  cool: 'कूल',
  super: 'सुपर',
  ready: 'रेडी',
  friend: 'फ्रेंड',
  friends: 'फ्रेंड्स',
  problem: 'प्रॉब्लम',
  tension: 'टेंशन',
  please: 'प्लीज़',
  thanks: 'थैंक्स',
  sorry: 'सॉरी',
  tia: 'टिया',
  energy: 'एनर्जी',
  dhamakedar: 'धमाकेदार',
  bulaana: 'बुलाना',
  bulana: 'बुलाना',
};

/**
 * Determines whether text is Hindi or Hinglish context for speech normalization.
 */
export function isHindiOrHinglish(
  text: string,
  detectedLanguage?: 'hindi' | 'hinglish' | 'english'
): boolean {
  if (!text) return false;
  // If explicitly tagged English and contains no Devanagari script, keep strictly English
  if (detectedLanguage === 'english' && !hasDevanagariScript(text)) {
    return false;
  }
  if (detectedLanguage === 'hindi' || detectedLanguage === 'hinglish') {
    return true;
  }
  if (hasDevanagariScript(text)) {
    return true;
  }
  const hindiPattern =
    /\b(aaj|kal|main|mera|meri|mere|mujhe|aap|aapka|aapki|aapke|aapko|tum|tumhe|tumhara|tumhari|tumhare|hai|hain|hoon|kya|kyun|kaise|mein|zyada|thode|thoda|thodi|kaafi|achha|accha|saath|chalo|rahi|raha|rahe|nahi|nahin|bahut|bohot|bilkul|yeh|woh|karo|batao|suno|dekho)\b/i;
  return hindiPattern.test(text);
}

/**
 * Context-aware resolution for the word "use":
 * Distinguishes between:
 * 1. English verb/noun "use" (/juːz/) -> "यूज़"
 *    e.g. "energy ko use karke", "feature ka use", "app ko use karo", "please use"
 * 2. Hindi 3rd-person pronoun "use" ("उसे" / /ʊseː/ = him/her/that)
 *    e.g. "Mujhe use bulaana hai", "Use bata do", "Humne use dekha", "Use phone karo"
 */
export function resolveHinglishUse(
  fullStr: string,
  offset: number,
  word: string
): string {
  const before = fullStr.slice(0, offset).trim();
  const prevMatch = before.match(/\b([a-zA-Z\u0900-\u097F]+)[^\w\u0900-\u097F]*$/);
  const prevWord = prevMatch ? prevMatch[1].toLowerCase() : '';

  const after = fullStr.slice(offset + word.length).trim();
  const nextMatch = after.match(
    /^([a-zA-Z\u0900-\u097F]+)(?:\s+([a-zA-Z\u0900-\u097F]+))?/
  );
  const nextWord = nextMatch ? nextMatch[1].toLowerCase() : '';
  const nextWord2 = nextMatch && nextMatch[2] ? nextMatch[2].toLowerCase() : '';

  // English compound light verbs following "use" (e.g. "use karke", "use karo", "use karna")
  const englishFollowingVerbs = new Set([
    'karke', 'करके', 'karo', 'करो', 'karein', 'karen', 'करें', 'kare', 'करे',
    'karna', 'करना', 'karnaa', 'karenge', 'करेंगे', 'karega', 'करेगा', 'karegi', 'करेगी',
    'kiya', 'किया', 'kiye', 'किए', 'ki', 'की',
    'karte', 'करते', 'karti', 'करती', 'karta', 'करता', 'kar', 'कर',
    'hota', 'होता', 'hoti', 'होती', 'hote', 'होते', 'hona', 'होना', 'hone', 'होने',
    'hua', 'हुआ', 'hui', 'हुई', 'hue', 'हुए', 'ho', 'हो',
  ]);

  // English preceding object markers, possessives, prepositions, or modals
  const englishPreceding = new Set([
    'ko', 'को', 'ka', 'का', 'ke', 'के', 'ki', 'की',
    'to', 'please', 'can', 'cant', 'cannot', 'could', 'will', 'would', 'should',
    'must', 'dont', 'make', 'in', 'how', 'you', 'we', 'i', 'they',
  ]);

  // English determiners/pronouns following "use" (e.g. "use this", "use that", "use it")
  const englishFollowingDeterminers = new Set([
    'this', 'that', 'these', 'those', 'it', 'the', 'a', 'an',
    'your', 'my', 'our', 'its', 'their', 'of', 'cases', 'case',
  ]);

  // Hindi verbs acting on a person following "use" (e.g. "use bulaana", "use bol", "use batao")
  const hindiPersonVerbs = new Set([
    'bulaana', 'bulao', 'bulaya', 'bulana', 'bula', 'बुलाना', 'बुलाओ', 'बुलाया', 'बुला',
    'bol', 'bolo', 'boliye', 'bola', 'bolna', 'बोल', 'बोलो', 'बोलिए', 'बोला', 'बोलना',
    'bata', 'batao', 'bataiye', 'bataya', 'batana', 'बता', 'बताओ', 'बताइए', 'बताया', 'बताना',
    'de', 'do', 'dena', 'diya', 'dijiye', 'दे', 'दो', 'देना', 'दिया', 'दीजिए',
    'le', 'lo', 'lena', 'liya', 'lijiye', 'ले', 'लो', 'लेना', 'लिया',
    'dekh', 'dekho', 'dekha', 'dekhna', 'देख', 'देखो', 'देखा', 'देखना',
    'samjha', 'samjhao', 'samjhana', 'समझा', 'समझो', 'समझाओ',
    'rok', 'roko', 'rokna', 'रोक', 'रोको', 'रोकना',
    'pata', 'पता', 'yaad', 'याद', 'lagta', 'laga', 'लगता', 'लगा',
    'pasand', 'पसंद', 'zaroorat', 'zarurat', 'ज़रूरत', 'chahiye', 'चाहिए',
    'milna', 'milo', 'मिलना', 'मिलो', 'bhejo', 'bhej', 'भेजो', 'भेज',
    'poocho', 'pucho', 'पूछो', 'chhod', 'chhodo', 'छोड़', 'छोड़ो',
    'aane', 'jaane', 'आने', 'जाने', 'jaanta', 'jaante', 'jaanti', 'जानता', 'जानते', 'जानती',
  ]);

  // Hindi subject pronouns preceding "use" (e.g. "mujhe use", "maine use", "humne use")
  const hindiPrecedingPronouns = new Set([
    'mujhe', 'मुझे', 'humein', 'hamein', 'हमें', 'tumhe', 'tumhein', 'तुम्हें', 'aapko', 'आपको',
    'maine', 'मैंने', 'humne', 'hamne', 'हमने', 'tumne', 'तुमने', 'aapne', 'आपने',
    'usne', 'उसने', 'isne', 'इसने', 'unhone', 'उन्होंने', 'inhone', 'इन्होंने',
  ]);

  // 1. Direct English indicators
  if (englishPreceding.has(prevWord)) {
    return 'यूज़';
  }
  if (englishFollowingVerbs.has(nextWord)) {
    return 'यूज़';
  }
  if (englishFollowingDeterminers.has(nextWord)) {
    return 'use';
  }
  if (
    (nextWord === 'mat' || nextWord === 'मत' || nextWord === 'nahi' || nextWord === 'nahin' || nextWord === 'नहीं') &&
    englishFollowingVerbs.has(nextWord2)
  ) {
    return 'यूज़';
  }

  // 2. Direct Hindi pronoun indicators
  if (hindiPrecedingPronouns.has(prevWord)) {
    return 'उसे';
  }
  if (hindiPersonVerbs.has(nextWord)) {
    return 'उसे';
  }
  if (
    (nextWord === 'mat' || nextWord === 'मत' || nextWord === 'nahi' || nextWord === 'nahin' || nextWord === 'नहीं') &&
    hindiPersonVerbs.has(nextWord2)
  ) {
    return 'उसे';
  }

  // 3. Fallback: if followed by "bhi", "hi", "toh" -> Hindi pronoun "उसे"
  if (['bhi', 'भी', 'hi', 'ही', 'toh', 'तो'].includes(nextWord)) {
    return 'उसे';
  }

  // 4. Default in Hinglish: Hindi pronoun "उसे"
  return 'उसे';
}

/**
 * Speech-only normalization layer for Roman Hindi / Hinglish.
 * Converts ambiguous Roman Hindi words into unambiguous Devanagari before TTS
 * so native Hindi engines (like Google Hindi) enunciate correctly (e.g. Hindi particle "hi"
 * as "ही", NOT English greeting "high"/"हाय"; English "use" as "यूज़", NOT Hindi "उसे").
 *
 * Rules:
 * - Does NOT modify displayed text in chat UI.
 * - Does NOT convert pure English sentences to Hindi.
 * - Preserves English loanwords and brand names where appropriate.
 * - Distinguishes between English greeting "Hi" and Hindi emphatic particle "hi" ("ही").
 * - Distinguishes between English verb/noun "use" ("यूज़") and Hindi pronoun "use" ("उसे").
 * - Does NOT break words such as "this", "think", "history", or "high".
 * - Runs in sub-millisecond local memory without latency.
 */
export function normalizeRomanHindiForSpeech(
  text: string,
  detectedLanguage?: 'hindi' | 'hinglish' | 'english'
): string {
  if (!text) return '';
  if (!isHindiOrHinglish(text, detectedLanguage)) {
    return text;
  }

  // Tokenize word boundaries and map known Hindi words
  let normalized = text.replace(/\b([a-zA-Z]+)\b/g, (match, word, offset, fullStr) => {
    const lower = word.toLowerCase();

    // Context-sensitive resolution for "hi":
    // 1. If at start of sentence, clause, or after sentence punctuation -> English greeting "Hi" (/haɪ/)
    // 2. If preceded by another word in a Hindi sentence -> Hindi emphatic particle "ही" (/hiː/)
    if (lower === 'hi') {
      const before = fullStr.slice(0, offset).trim();
      if (!before || /[.!?।॥:]\s*$/.test(before)) {
        return word; // Keep greeting as "Hi"
      }
      return 'ही';
    }

    // Context-sensitive resolution for "use":
    // Distinguishes English verb/noun "use" ("यूज़") from Hindi pronoun "use" ("उसे")
    if (lower === 'use') {
      return resolveHinglishUse(fullStr, offset, word);
    }

    // Context-sensitive resolution for "the":
    // Prevents turning English definite article "the" into Hindi "थे"
    if (lower === 'the') {
      const before = fullStr.slice(0, offset).trim();
      const prevMatch = before.match(/\b([a-zA-Z\u0900-\u097F]+)[^\w\u0900-\u097F]*$/);
      const prevWord = prevMatch ? prevMatch[1].toLowerCase() : '';
      if (
        [
          'hum', 'हम', 'ham', 'tum', 'तुम', 'aap', 'आप',
          'wo', 'वो', 'woh', 'ye', 'ये', 'yeh', 'log', 'लोग',
          'wahan', 'वहाँ', 'yahan', 'यहाँ', 'pehle', 'पहले',
          'sab', 'सब', 'theek', 'ठीक', 'dono', 'दोनों',
        ].includes(prevWord)
      ) {
        return 'थे';
      }
      return 'the';
    }

    if (HINDI_ROMAN_TO_DEVANAGARI[lower]) {
      return HINDI_ROMAN_TO_DEVANAGARI[lower];
    }

    return word;
  });

  // Convert English full stop "." at end of Hindi sentence to authentic Devanagari Danda "।"
  normalized = normalized.replace(/([\u0900-\u097F])\s*\.(?=\s|$)/g, '$1।');

  return normalized;
}

/**
 * Cleans and conditions text before sending it to speech synthesis.
 * Strips markdown symbols, URLs, and code blocks.
 * Applies speech-only normalization for Roman Hindi words to Devanagari.
 * Expands common Indian abbreviations, decimals, and units so speech synthesizers enunciate cleanly.
 */
export function cleanTextForSpeech(
  text: string,
  detectedLanguage?: 'hindi' | 'hinglish' | 'english'
): string {
  if (!text) return '';

  // Canonical safety: Strip any JSON wrappers, double-encoded JSON, or residual {"reply": wrappers
  let cleaned = normalizeAssistantResponse(text);
  if (!cleaned) return '';

  // Canonical Unicode NFC normalization for composed Devanagari characters
  cleaned = cleaned.normalize('NFC');

  // 1. Initial cleanup of markdown blocks and list markers
  cleaned = cleaned
    // Remove code blocks
    .replace(/```[\s\S]*?```/g, '')
    // Remove inline code
    .replace(/`([^`]+)`/g, '$1')
    // Remove markdown links [text](url) -> text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Remove markdown bold/italic
    .replace(/[*_~]{1,3}/g, '')
    // Remove markdown headers
    .replace(/^#{1,6}\s+/gm, '')
    // Remove blockquotes and list markers
    .replace(/^>\s+/gm, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '');

  // 2. Speech-only normalization for Roman Hindi / Hinglish to unambiguous Devanagari.
  // Converts ambiguous Roman Hindi words into Devanagari before TTS so native Hindi engines
  // (like Google Hindi) enunciate correctly (e.g. Hindi particle 'hi' as 'ही', NOT English greeting 'high'/'हाय').
  cleaned = normalizeRomanHindiForSpeech(cleaned, detectedLanguage);

  // 3. TTS-only normalization for decimal numbers and temperature units
  cleaned = normalizeDecimalsForSpeech(cleaned);

  const isHindiContext = hasDevanagariScript(cleaned);

  // 4. Currency and symbol expansions
  if (isHindiContext) {
    cleaned = cleaned
      .replace(/₹\s*(\d+(?:\s*पॉइंट\s*\d+)?)/g, '$1 रुपये')
      .replace(/Rs\.?\s*(\d+(?:\s*पॉइंट\s*\d+)?)/gi, '$1 रुपये')
      .replace(/%/g, ' प्रतिशत')
      .replace(/&/g, ' और ')
      .replace(/\+/g, ' प्लस ')
      .replace(/=/g, ' बराबर ');
  } else {
    cleaned = cleaned
      .replace(/₹\s*(\d+(?:\s*point\s*\d+)?)/g, '$1 rupees')
      .replace(/Rs\.?\s*(\d+(?:\s*point\s*\d+)?)/gi, '$1 rupees')
      .replace(/%/g, ' percent')
      .replace(/&/g, ' and ')
      .replace(/\+/g, ' plus ')
      .replace(/=/g, ' equals ');
  }

  cleaned = cleaned
    // Expand common acronyms for crisp letter pronunciation in TTS
    .replace(/\bGDP\b/g, 'G D P')
    .replace(/\bUPI\b/g, 'U P I')
    .replace(/\bRBI\b/g, 'R B I')
    .replace(/\bIPL\b/g, 'I P L')
    .replace(/\bAI\b/g, 'A I')
    .replace(/\bIIT\b/g, 'I I T')
    .replace(/\bIIM\b/g, 'I I M')
    .replace(/\bGST\b/g, 'G S T')
    .replace(/\bCEO\b/g, 'C E O')
    .replace(/\bOTP\b/g, 'O T P')
    // Strip emojis (standard Unicode emoji ranges)
    .replace(
      /([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g,
      ''
    )
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned;
}

/**
 * Breaks cleaned text into natural conversational clauses and sentences.
 * This prevents monotone continuous rush and allows natural breathing pauses.
 * Includes Devanagari Danda (।) and Double Danda (॥) for authentic Hindi sentence cadence.
 */
export function segmentSpeechText(text: string): Array<{ text: string; isQuestion: boolean }> {
  if (!text) return [];

  // Match sentences ending in punctuation (including Devanagari Danda । and Double Danda ॥) or newlines
  const rawSegments = text.match(/[^.!?\n।॥]+[.!?\n।॥]*/g) || [text];
  const results: Array<{ text: string; isQuestion: boolean }> = [];

  for (const raw of rawSegments) {
    const trimmed = raw.trim();
    if (!trimmed) continue;

    const isQuestion =
      trimmed.endsWith('?') ||
      trimmed.endsWith('?।') ||
      trimmed.endsWith('?॥');
    results.push({
      text: trimmed,
      isQuestion,
    });
  }

  return results;
}

// Regional language codes that must NEVER be selected as Tia's default or fallback voice
const DISALLOWED_REGIONAL_PREFIXES = [
  'as', 'asm', // Assamese (ISO 639-1 & ISO 639-3)
  'bn', 'ben', // Bengali
  'gu', 'guj', // Gujarati
  'kn', 'kan', // Kannada
  'ml', 'mal', // Malayalam
  'mr', 'mar', // Marathi
  'or', 'ori', 'ory', // Odia
  'pa', 'pan', // Punjabi
  'ta', 'tam', // Tamil
  'te', 'tel', // Telugu
  'ur', 'urd', // Urdu
  'id', 'ind', // Indonesian
  'bho',       // Bhojpuri
  'mai',       // Maithili
  'sa', 'san', // Sanskrit
  'ne', 'nep', // Nepali
  'si', 'sin', // Sinhala
  'my', 'mya', // Burmese
];

const DISALLOWED_REGIONAL_NAMES = [
  'assamese',
  'as-in',
  'asm-in',
  'bengali',
  'bn-in',
  'gujarati',
  'gu-in',
  'kannada',
  'kn-in',
  'malayalam',
  'ml-in',
  'marathi',
  'mr-in',
  'odia',
  'oriya',
  'punjabi',
  'tamil',
  'ta-in',
  'telugu',
  'te-in',
  'urdu',
  'ur-in',
  'sinhala',
  'nepali',
];

export function isDisallowedRegionalVoice(voice: SpeechSynthesisVoice): boolean {
  if (!voice) return true;
  const langLower = (voice.lang || '').toLowerCase().replace(/_/g, '-');
  const nameLower = (voice.name || '').toLowerCase();

  for (const prefix of DISALLOWED_REGIONAL_PREFIXES) {
    if (
      langLower === prefix ||
      langLower.startsWith(`${prefix}-`) ||
      langLower.startsWith(`${prefix}_`)
    ) {
      return true;
    }
  }

  for (const name of DISALLOWED_REGIONAL_NAMES) {
    if (nameLower.includes(name)) {
      return true;
    }
  }

  return false;
}

export function isHindiVoice(voice: SpeechSynthesisVoice): boolean {
  if (!voice) return false;
  if (isDisallowedRegionalVoice(voice)) return false;
  const langLower = (voice.lang || '').toLowerCase().replace(/_/g, '-');
  const nameLower = (voice.name || '').toLowerCase();
  return (
    langLower.startsWith('hi') ||
    langLower.includes('hi-in') ||
    nameLower.includes('hindi')
  );
}

export function isIndianEnglishVoice(voice: SpeechSynthesisVoice): boolean {
  if (!voice) return false;
  if (isDisallowedRegionalVoice(voice)) return false;
  const langLower = (voice.lang || '').toLowerCase().replace(/_/g, '-');
  const nameLower = (voice.name || '').toLowerCase();
  return (
    langLower.includes('en-in') ||
    (langLower.startsWith('en') && (nameLower.includes('india') || nameLower.includes('indian')))
  );
}

export function isGeneralEnglishVoice(voice: SpeechSynthesisVoice): boolean {
  if (!voice) return false;
  if (isDisallowedRegionalVoice(voice)) return false;
  const langLower = (voice.lang || '').toLowerCase().replace(/_/g, '-');
  return langLower.startsWith('en');
}

/**
 * Validates that a voice is strictly permitted for Tia (Hindi or English ONLY).
 * Completely bars any regional non-Hindi, non-English voice.
 */
export function isAllowedTiaVoice(voice: SpeechSynthesisVoice): boolean {
  if (!voice) return false;
  if (isDisallowedRegionalVoice(voice)) return false;
  return isHindiVoice(voice) || isIndianEnglishVoice(voice) || isGeneralEnglishVoice(voice);
}

/**
 * Discovers and prioritizes natural Indian voices on the device.
 */
export function getAvailableVoices(): SpeechVoiceOption[] {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return [];
  }

  const voices = window.speechSynthesis.getVoices();
  const options: SpeechVoiceOption[] = [];

  for (const v of voices) {
    // Only include permitted Tia voices (Hindi or English)
    if (!isAllowedTiaVoice(v)) continue;

    const nameLower = v.name.toLowerCase();

    const isIndian = isHindiVoice(v) || isIndianEnglishVoice(v);

    const isFemale =
      nameLower.includes('female') ||
      nameLower.includes('woman') ||
      nameLower.includes('neerja') ||
      nameLower.includes('swara') ||
      nameLower.includes('heera') ||
      nameLower.includes('lekha') ||
      nameLower.includes('kalpana') ||
      nameLower.includes('zira') ||
      nameLower.includes('samantha') ||
      nameLower.includes('karen') ||
      nameLower.includes('victoria');

    const isMale =
      nameLower.includes('male') ||
      nameLower.includes('man') ||
      nameLower.includes('prabhat') ||
      nameLower.includes('ravi') ||
      nameLower.includes('david') ||
      nameLower.includes('guy') ||
      nameLower.includes('george');

    const isNatural =
      nameLower.includes('natural') ||
      nameLower.includes('online') ||
      nameLower.includes('neural') ||
      nameLower.includes('google');

    options.push({
      name: v.name,
      lang: v.lang,
      voiceURI: v.voiceURI,
      isIndian,
      isFemale,
      isMale,
      isNatural,
    });
  }

  // Sort: Indian female voices first, then Indian male/other, then general English natural voices
  return options.sort((a, b) => {
    let scoreA = 0;
    let scoreB = 0;

    if (a.isIndian) scoreA += 15;
    if (b.isIndian) scoreB += 15;

    if (a.isFemale) scoreA += 5;
    if (b.isFemale) scoreB += 5;

    if (a.isNatural) scoreA += 3;
    if (b.isNatural) scoreB += 3;

    return scoreB - scoreA;
  });
}

/**
 * Detects whether the given text contains any Devanagari Unicode characters (U+0900 to U+097F).
 * Covers all Hindi consonants, vowels, matras, nuktas, virama, and digits.
 */
export function hasDevanagariScript(text: string): boolean {
  if (!text) return false;
  return /[\u0900-\u097F]/.test(text);
}

/**
 * Phonetically transliterates Devanagari text into natural Latin Hinglish.
 * Used when a device/browser lacks native Hindi TTS voices (e.g. desktop/laptop with only English voices),
 * enabling Indian English and system speech synthesizers to enunciate Hindi words with fluent, natural phonetics
 * instead of choking, going silent, or mispronouncing Devanagari glyphs with English letter sounds.
 */
export function devanagariToPhoneticLatin(text: string): string {
  if (!text) return '';

  const vowels: Record<string, string> = {
    'अ': 'a', 'आ': 'aa', 'इ': 'i', 'ई': 'ee', 'उ': 'u', 'ऊ': 'oo', 'ऋ': 'ri',
    'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au', 'ऑ': 'o', 'ऍ': 'e',
  };
  const matras: Record<string, string> = {
    'ा': 'aa', 'ि': 'i', 'ी': 'ee', 'ु': 'u', 'ू': 'oo', 'ृ': 'ri',
    'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ॉ': 'o', 'ॅ': 'e',
  };
  const consonants: Record<string, string> = {
    'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'ng',
    'च': 'ch', 'छ': 'chh', 'ज': 'j', 'झ': 'jh', 'ञ': 'ny',
    'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh', 'ण': 'n',
    'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n',
    'प': 'p', 'फ': 'ph', 'ब': 'b', 'भ': 'bh', 'म': 'm',
    'य': 'y', 'र': 'r', 'ल': 'l', 'व': 'v', 'श': 'sh', 'ष': 'sh', 'स': 's', 'ह': 'h',
    'क़': 'q', 'ख़': 'kh', 'ग़': 'gh', 'ज़': 'z', 'ड़': 'r', 'ढ़': 'rh', 'फ़': 'f',
  };
  const digits: Record<string, string> = {
    '०': '0', '१': '1', '२': '2', '३': '3', '४': '4', '५': '5', '६': '6', '७': '7', '८': '8', '९': '9',
  };

  let s = text.normalize('NFC');
  s = s.replace(/[०-९]/g, (d) => digits[d] || d);
  s = s.replace(/।/g, '.').replace(/॥/g, '.');

  // Common Hindi high-frequency conversational words for optimal TTS prosody
  const wordOverrides: Record<string, string> = {
    'है': 'hai',
    'हैं': 'hain',
    'हूँ': 'hoon',
    'हो': 'ho',
    'था': 'tha',
    'थी': 'thi',
    'थे': 'the',
    'हाँ': 'haan',
    'नहीं': 'nahin',
    'और': 'aur',
    'क्या': 'kya',
    'क्यों': 'kyun',
    'कैसे': 'kaise',
    'कब': 'kab',
    'कहाँ': 'kahan',
    'कौन': 'kaun',
    'कितना': 'kitna',
    'कितने': 'kitne',
    'कितनी': 'kitni',
    'बहुत': 'bahut',
    'अच्छा': 'achha',
    'नमस्ते': 'namaste',
    'मौसम': 'mausam',
    'तापमान': 'taapmaan',
    'डिग्री': 'degree',
    'सेल्सियस': 'celsius',
    'भारत': 'bharat',
    'क्रिकेट': 'cricket',
    'मैच': 'match',
    'जीत': 'jeet',
    'जीता': 'jeeta',
    'जीती': 'jeeti',
    'जीते': 'jeete',
    'हार': 'haar',
    'स्कोर': 'score',
    'विकेट': 'wicket',
    'रन': 'run',
    'आज': 'aaj',
    'कल': 'kal',
    'अलविदा': 'alvida',
    'शुक्रिया': 'shukriya',
    'धन्यवाद': 'dhanyavaad',
    'दोस्त': 'dost',
    'बिल्कुल': 'bilkul',
    'ज़्यादा': 'zyada',
    'कम': 'kam',
    'सब': 'sab',
    'ठीक': 'theek',
    'बारिश': 'baarish',
    'धूप': 'dhoop',
    'हवा': 'hawa',
    'बादल': 'baadal',
    'टिया': 'Tia',
    'बॉस': 'boss',
    'ही': 'hee',
    'भी': 'bhee',
    'थोड़ा': 'thoda',
    'थोड़े': 'thode',
    'थोड़ी': 'thodi',
    'काफ़ी': 'kaafi',
    'काफी': 'kaafi',
    'साथ': 'saath',
    'चलो': 'chalo',
    'अभी': 'abhi',
    'रही': 'rahi',
    'रहा': 'raha',
    'रहे': 'rahe',
    'सर्वर्स': 'servers',
    'सर्वर': 'server',
    'हैप्पी': 'happy',
    'मूड': 'mood',
    'में': 'mein',
    'मैं': 'main',
    'तुम': 'tum',
    'आप': 'aap',
    'हम': 'hum',
    'ये': 'ye',
    'वो': 'wo',
    'यूज़': 'use',
    'उसे': 'usey',
  };

  return s.replace(/[\u0900-\u097F]+/g, (chunk) => {
    if (wordOverrides[chunk]) {
      return wordOverrides[chunk];
    }
    let out = '';
    const len = chunk.length;
    for (let i = 0; i < len; i++) {
      const ch = chunk[i];
      const next = i + 1 < len ? chunk[i + 1] : '';

      if (digits[ch]) {
        out += digits[ch];
        continue;
      }
      if (vowels[ch]) {
        out += vowels[ch];
        continue;
      }
      if (consonants[ch]) {
        const c = consonants[ch];
        if (next === '्') { // halant / virama suppresses inherent vowel
          out += c;
          i++;
        } else if (matras[next]) {
          out += c + matras[next];
          i++;
        } else if (next === 'ं' || next === 'ँ') {
          out += c + 'an';
          i++;
        } else if (i === len - 1) { // terminal consonant: schwa deletion in modern Hindi
          out += c;
        } else if (consonants[next] || vowels[next]) {
          out += c + 'a';
        } else {
          out += c;
        }
        continue;
      }
      if (matras[ch]) {
        out += matras[ch];
        continue;
      }
      if (ch === 'ं' || ch === 'ँ') {
        out += 'n';
        continue;
      }
      if (ch === 'ः') {
        out += 'h';
        continue;
      }
      out += ch;
    }
    return out;
  });
}

/**
 * Intelligently chooses the best voice instance based on:
 * - Actual text script (Devanagari vs Latin)
 * - Language (Hindi, Hinglish, English)
 * - Emotion & conversation context
 * - Gender appropriateness (default female for Tia)
 * - Natural/Neural engine priority
 * - Strict guard against inappropriate regional languages (e.g. Assamese)
 */
export function selectContextualVoice(
  criteria: VoiceSelectionCriteria,
  availableVoices?: SpeechSynthesisVoice[]
): { voice: SpeechSynthesisVoice | null; voiceLabel: string } {
  const hasProvidedVoices = Boolean(availableVoices && availableVoices.length > 0);
  if (!hasProvidedVoices && (typeof window === 'undefined' || !('speechSynthesis' in window))) {
    return { voice: null, voiceLabel: 'Tia Voice' };
  }

  const voices = hasProvidedVoices
    ? availableVoices!
    : window.speechSynthesis.getVoices();

  if (voices.length === 0) {
    return { voice: null, voiceLabel: 'Tia Voice' };
  }

  const textHasDevanagari = criteria.text ? hasDevanagariScript(criteria.text) : false;

  // 1. If user explicitly locked a voice in Settings and autoVoiceSelection is disabled
  if (criteria.userPreferenceURI) {
    const lockedMatch = voices.find((v) => v.voiceURI === criteria.userPreferenceURI);
    // Never allow an English voice to read Devanagari Hindi text even if locked,
    // to strictly prevent pronouncing Devanagari words like 'ही' as English 'Hi'
    if (lockedMatch && isAllowedTiaVoice(lockedMatch)) {
      if (!textHasDevanagari || isHindiVoice(lockedMatch)) {
        return { voice: lockedMatch, voiceLabel: lockedMatch.name };
      }
    }
  }

  const { detectedLanguage = 'hinglish', emotion = 'neutral', preferredGender = 'female' } = criteria;

  // Filter candidate pool to only permitted Tia voices (Hindi or English)
  const candidateVoices = voices.filter((v) => isAllowedTiaVoice(v));

  // Score each candidate voice against criteria
  let bestScore = -1000;
  let bestVoice: SpeechSynthesisVoice | null = null;

  for (const v of candidateVoices) {
    let score = 0;
    const nameLower = v.name.toLowerCase();

    const isHindi = isHindiVoice(v);
    const isIndianEn = isIndianEnglishVoice(v);
    const isGeneralEn = isGeneralEnglishVoice(v);

    const isFemale =
      nameLower.includes('female') ||
      nameLower.includes('woman') ||
      nameLower.includes('neerja') ||
      nameLower.includes('swara') ||
      nameLower.includes('heera') ||
      nameLower.includes('lekha') ||
      nameLower.includes('kalpana') ||
      nameLower.includes('zira') ||
      nameLower.includes('samantha');

    const isMale =
      nameLower.includes('male') ||
      nameLower.includes('man') ||
      nameLower.includes('prabhat') ||
      nameLower.includes('ravi') ||
      nameLower.includes('david') ||
      nameLower.includes('guy');

    const isNeural =
      nameLower.includes('natural') ||
      nameLower.includes('online') ||
      nameLower.includes('neural') ||
      nameLower.includes('google');

    // Language & Script suitability scoring:
    // When text contains Devanagari script, strongly prefer native Hindi voice (lang: hi-IN)
    // and heavily penalize English voices so Devanagari words are NEVER pronounced with English phonetics.
    if (textHasDevanagari) {
      if (isHindi) score += 200;
      else if (isIndianEn) score -= 150;
      else if (isGeneralEn) score -= 200;
    } else if (detectedLanguage === 'hindi') {
      if (isHindi) score += 120;
      else if (isIndianEn) score += 50;
      else if (isGeneralEn) score += 20;
    } else if (detectedLanguage === 'english') {
      if (isIndianEn) score += 100;
      else if (isGeneralEn) score += 70;
      else if (isHindi) score += 30;
    } else {
      // Hinglish in Latin script: Indian English voice is ideal for natural Indian English & Latin Hindi slang
      if (isIndianEn) score += 100;
      else if (isHindi) score += 75;
      else if (isGeneralEn) score += 30;
    }

    // Neural / Natural voices offer substantially better prosody
    if (isNeural) {
      score += 15;
    }

    // Gender matching (default female for Tia's voice identity)
    if (preferredGender === 'male') {
      if (isMale) score += 20;
      else if (isFemale) score -= 10;
    } else {
      if (isFemale) score += 20;
      else if (isMale) score -= 10;
    }

    // Emotion resonance
    if (emotion === 'serious' || emotion === 'calm' || emotion === 'reassuring') {
      if (nameLower.includes('swara') || isNeural) score += 5;
    }
    if (emotion === 'playful' || emotion === 'funny' || emotion === 'excited') {
      if (nameLower.includes('neerja') || isNeural) score += 5;
    }

    if (score > bestScore) {
      bestScore = score;
      bestVoice = v;
    }
  }

  // Safe fallback hierarchy: strictly limited to isAllowedTiaVoice
  if (!bestVoice) {
    if (textHasDevanagari) {
      bestVoice =
        candidateVoices.find((v) => isHindiVoice(v)) ||
        candidateVoices.find((v) => isIndianEnglishVoice(v)) ||
        candidateVoices.find((v) => isGeneralEnglishVoice(v)) ||
        candidateVoices[0] ||
        null;
    } else {
      bestVoice =
        candidateVoices.find((v) => isIndianEnglishVoice(v)) ||
        candidateVoices.find((v) => isHindiVoice(v)) ||
        candidateVoices.find((v) => isGeneralEnglishVoice(v) && (v.name.toLowerCase().includes('female') || v.name.toLowerCase().includes('zira'))) ||
        candidateVoices.find((v) => isGeneralEnglishVoice(v)) ||
        candidateVoices.find((v) => v.default) ||
        candidateVoices[0] ||
        null;
    }
  }

  const voiceLabel = bestVoice ? bestVoice.name : (textHasDevanagari ? 'Tia Hindi (hi-IN)' : 'Tia Voice');

  return {
    voice: bestVoice,
    voiceLabel,
  };
}

/**
 * Controller interface for an active speech session
 */
export interface SpeechSessionController {
  cancel: () => void;
}

// Module-level set to retain active utterances in memory.
// This prevents Chromium V8 garbage-collection from prematurely killing active speech playback.
const activeUtterancesSet = new Set<SpeechSynthesisUtterance>();

/**
 * Speaks text naturally using emotion-aware prosody, utterance segmentation,
 * and conversational pauses.
 */
export function speakEmotionally({
  text,
  emotion = 'neutral',
  detectedLanguage = 'hinglish',
  voice,
  baseRate = 1.0,
  onStart,
  onEnd,
  onError,
}: {
  text: string;
  emotion?: TiaEmotion;
  detectedLanguage?: 'hindi' | 'hinglish' | 'english';
  voice: SpeechSynthesisVoice | null;
  baseRate?: number;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (err: unknown) => void;
}): SpeechSessionController {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    onEnd?.();
    return { cancel: () => {} };
  }

  // Unpause Web Speech engine if previously paused or stuck
  if (window.speechSynthesis.paused) {
    try {
      window.speechSynthesis.resume();
    } catch {
      // ignore
    }
  }

  // Cancel any prior speech if active
  if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // ignore
    }
  }

  const cleaned = cleanTextForSpeech(text, detectedLanguage);
  if (!cleaned) {
    onEnd?.();
    return { cancel: () => {} };
  }

  const segments = segmentSpeechText(cleaned);
  if (segments.length === 0) {
    onEnd?.();
    return { cancel: () => {} };
  }

  const prosody = EMOTION_PROSODY_MAP[emotion] || EMOTION_PROSODY_MAP.neutral;
  let isCancelled = false;
  let currentSegmentIndex = 0;
  let pauseTimer: ReturnType<typeof setTimeout> | null = null;

  const cancel = () => {
    isCancelled = true;
    if (pauseTimer) {
      clearTimeout(pauseTimer);
      pauseTimer = null;
    }
    activeUtterancesSet.clear();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore
      }
    }
  };

  const speakNextSegment = () => {
    if (isCancelled) return;

    if (currentSegmentIndex >= segments.length) {
      onEnd?.();
      return;
    }

    const { text: segText, isQuestion } = segments[currentSegmentIndex];
    const segHasDevanagari = hasDevanagariScript(segText);

    // Resolve active voice with asynchronous fallback if voices loaded late
    let activeVoice = voice;
    let liveVoices: SpeechSynthesisVoice[] = [];
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      liveVoices = window.speechSynthesis.getVoices();
      if (liveVoices.length > 0) {
        // If segment has Devanagari script, aggressively look for a native Hindi voice
        if (segHasDevanagari && (!activeVoice || !isHindiVoice(activeVoice))) {
          const hindiVoiceMatch = liveVoices.find((v) => isHindiVoice(v));
          if (hindiVoiceMatch) {
            activeVoice = hindiVoiceMatch;
          }
        } else if (!activeVoice) {
          const resolved = selectContextualVoice(
            {
              emotion,
              detectedLanguage,
              text: cleaned,
            },
            liveVoices
          );
          activeVoice = resolved.voice;
        }
      }
    }

    const hasNativeHindiVoice = Boolean(activeVoice && isHindiVoice(activeVoice));

    // Prepare speech text:
    // If text has Devanagari AND we have a native Hindi voice: speak Hindi text directly.
    // If text has Devanagari BUT system lacks a native Hindi voice (e.g. laptop or system with only English voices):
    // transliterate Devanagari to clean phonetic Latin (Hinglish) so the Indian English / system voice enunciates
    // the Hindi words accurately with fluent Indian phonetics rather than choking or mispronouncing!
    const textToSpeakInUtterance =
      segHasDevanagari && !hasNativeHindiVoice
        ? devanagariToPhoneticLatin(segText)
        : segText;

    const utterance = new SpeechSynthesisUtterance(textToSpeakInUtterance);

    // Keep reference in module-level set to prevent GC collection during speech playback
    activeUtterancesSet.add(utterance);

    // Configure voice and language
    if (hasNativeHindiVoice && activeVoice) {
      utterance.voice = activeVoice;
      utterance.lang = 'hi-IN';
    } else if (segHasDevanagari) {
      // No native Hindi voice on device:
      // Pair phonetic Latin Hindi with best Indian English voice (or candidate voice)
      const indianEnVoice =
        liveVoices.find((v) => isIndianEnglishVoice(v)) ||
        (activeVoice && isAllowedTiaVoice(activeVoice) ? activeVoice : null);
      if (indianEnVoice) {
        utterance.voice = indianEnVoice;
      }
      utterance.lang = 'en-IN';
    } else if (activeVoice && isAllowedTiaVoice(activeVoice)) {
      utterance.voice = activeVoice;
      if (activeVoice.lang && !isDisallowedRegionalVoice(activeVoice)) {
        utterance.lang = activeVoice.lang;
      } else {
        utterance.lang = detectedLanguage === 'hindi' ? 'hi-IN' : 'en-IN';
      }
    } else {
      // Default language tag if no voice instance attached
      if (detectedLanguage === 'hindi') {
        utterance.lang = 'hi-IN';
      } else {
        utterance.lang = 'en-IN';
      }
    }

    // Dynamic emotion rate and pitch
    const calculatedRate = Math.max(0.65, Math.min(1.5, baseRate * prosody.rateMultiplier));
    utterance.rate = calculatedRate;

    // Rising inflection for questions
    let segmentPitch = prosody.pitch;
    if (isQuestion) {
      segmentPitch = Math.min(1.35, segmentPitch + 0.08);
    }
    utterance.pitch = Math.max(0.7, Math.min(1.4, segmentPitch));
    utterance.volume = prosody.volume;

    utterance.onstart = () => {
      if (currentSegmentIndex === 0) {
        onStart?.();
      }
    };

    utterance.onend = () => {
      activeUtterancesSet.delete(utterance);
      if (isCancelled) return;
      currentSegmentIndex++;

      if (currentSegmentIndex < segments.length) {
        pauseTimer = setTimeout(() => {
          speakNextSegment();
        }, prosody.pauseDurationMs);
      } else {
        onEnd?.();
      }
    };

    let retriedFallback = false;
    utterance.onerror = (e) => {
      activeUtterancesSet.delete(utterance);
      if (e.error === 'canceled' || e.error === 'interrupted' || isCancelled) {
        return;
      }
      console.warn('Speech segment error:', e);

      // Resilient fallback: If voice or regional language tag fails on user's device/browser,
      // retry with universal system voice fallback rather than staying completely silent!
      if (!retriedFallback && (utterance.voice || utterance.lang !== 'en-US')) {
        retriedFallback = true;
        console.log('Retrying speech with generic system voice fallback...');
        const fallbackText =
          segHasDevanagari && !hasNativeHindiVoice
            ? devanagariToPhoneticLatin(segText)
            : (segHasDevanagari ? devanagariToPhoneticLatin(segText) : segText);
        const fallbackUtterance = new SpeechSynthesisUtterance(fallbackText);
        fallbackUtterance.rate = utterance.rate;
        fallbackUtterance.pitch = utterance.pitch;
        fallbackUtterance.volume = utterance.volume;
        fallbackUtterance.lang = segHasDevanagari ? 'en-IN' : 'en-US';
        activeUtterancesSet.add(fallbackUtterance);

        fallbackUtterance.onstart = utterance.onstart;
        fallbackUtterance.onend = utterance.onend;
        fallbackUtterance.onerror = (fallbackErr) => {
          activeUtterancesSet.delete(fallbackUtterance);
          console.warn('Fallback speech segment error:', fallbackErr);
          currentSegmentIndex++;
          if (currentSegmentIndex < segments.length) {
            speakNextSegment();
          } else {
            onEnd?.();
          }
        };

        try {
          if (window.speechSynthesis.paused) {
            window.speechSynthesis.resume();
          }
          window.speechSynthesis.speak(fallbackUtterance);
          return;
        } catch {
          // continue below to next segment
        }
      }

      currentSegmentIndex++;
      if (currentSegmentIndex < segments.length) {
        speakNextSegment();
      } else {
        onError?.(e);
        onEnd?.();
      }
    };

    // Ensure engine is not in paused state before dispatching
    if (window.speechSynthesis.paused) {
      try {
        window.speechSynthesis.resume();
      } catch {
        // ignore
      }
    }

    try {
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.warn('speechSynthesis.speak invocation error:', err);
      activeUtterancesSet.delete(utterance);
      currentSegmentIndex++;
      if (currentSegmentIndex < segments.length) {
        speakNextSegment();
      } else {
        onError?.(err);
        onEnd?.();
      }
    }
  };

  // Safe tick to allow any prior cancellation to clear in Chromium IPC queue
  setTimeout(() => {
    if (!isCancelled) {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window && window.speechSynthesis.paused) {
        try {
          window.speechSynthesis.resume();
        } catch {
          // ignore
        }
      }
      speakNextSegment();
    }
  }, 60);

  return { cancel };
}

// Module-level pointer to any active HTML5 audio element playing premium speech
let activeAudioElement: HTMLAudioElement | null = null;

export function stopAnyActiveAudio() {
  if (activeAudioElement) {
    try {
      activeAudioElement.pause();
      activeAudioElement.currentTime = 0;
      activeAudioElement.src = '';
    } catch {
      // ignore
    }
    activeAudioElement = null;
  }
}

export function stopAllSpeech() {
  stopAnyActiveAudio();
  activeUtterancesSet.clear();
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // ignore
    }
  }
}

/**
 * Speaks text using the premium cloud voice provider (Aoede / Kore / Chirp 3 HD) via backend /api/tts.
 * Automatically falls back to the local browser speech synthesis engine if the API
 * encounters rate limiting (429), timeouts, errors, or offline status.
 */
export function speakWithPremiumVoice({
  text,
  voiceId = 'Aoede',
  emotion = 'neutral',
  detectedLanguage = 'hinglish',
  baseRate = 1.0,
  fallbackVoice = null,
  onStart,
  onEnd,
  onError,
}: {
  text: string;
  voiceId?: string;
  emotion?: TiaEmotion;
  detectedLanguage?: 'hindi' | 'hinglish' | 'english';
  baseRate?: number;
  fallbackVoice?: SpeechSynthesisVoice | null;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (err: unknown) => void;
}): SpeechSessionController {
  stopAnyActiveAudio();
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // ignore
    }
  }

  const cleaned = cleanTextForSpeech(text, detectedLanguage);
  if (!cleaned) {
    onEnd?.();
    return { cancel: () => {} };
  }

  let isCancelled = false;
  let fallbackSession: SpeechSessionController | null = null;
  const abortController = new AbortController();

  const cancel = () => {
    isCancelled = true;
    abortController.abort();
    stopAnyActiveAudio();
    if (fallbackSession) {
      fallbackSession.cancel();
      fallbackSession = null;
    }
  };

  (async () => {
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: cleaned,
          voiceId,
          emotion,
          detectedLanguage,
        }),
        signal: abortController.signal,
      });

      if (!res.ok) {
        throw new Error(`TTS server HTTP ${res.status}`);
      }

      const data = await res.json();
      if (isCancelled) return;

      if (data.success && data.audioData) {
        // Successful premium cloud audio
        const binary = atob(data.audioData);
        const len = binary.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: data.mimeType || 'audio/wav' });
        const audioUrl = URL.createObjectURL(blob);

        const audio = new Audio(audioUrl);
        activeAudioElement = audio;
        audio.playbackRate = Math.max(0.75, Math.min(1.4, baseRate));

        audio.onplay = () => {
          if (!isCancelled) {
            onStart?.();
          }
        };

        audio.onended = () => {
          URL.revokeObjectURL(audioUrl);
          if (activeAudioElement === audio) {
            activeAudioElement = null;
          }
          if (!isCancelled) {
            onEnd?.();
          }
        };

        audio.onerror = (e) => {
          URL.revokeObjectURL(audioUrl);
          if (activeAudioElement === audio) {
            activeAudioElement = null;
          }
          if (isCancelled) return;
          console.warn('[TTS] Audio element error, falling back to browser voice:', e);
          fallbackSession = speakEmotionally({
            text,
            emotion,
            detectedLanguage,
            voice: fallbackVoice,
            baseRate,
            onStart,
            onEnd,
            onError,
          });
        };

        await audio.play();
      } else {
        // Fallback flag returned by server (e.g. rate limit or browser selected)
        console.log('[TTS] Server suggested fallback to browser engine:', data.reason || data.error);
        if (isCancelled) return;
        fallbackSession = speakEmotionally({
          text,
          emotion,
          detectedLanguage,
          voice: fallbackVoice,
          baseRate,
          onStart,
          onEnd,
          onError,
        });
      }
    } catch (err: any) {
      if (err.name === 'AbortError' || isCancelled) return;
      console.warn('[TTS] Network error or timeout, falling back to browser voice:', err?.message);
      if (isCancelled) return;
      fallbackSession = speakEmotionally({
        text,
        emotion,
        detectedLanguage,
        voice: fallbackVoice,
        baseRate,
        onStart,
        onEnd,
        onError,
      });
    }
  })();

  return { cancel };
}

