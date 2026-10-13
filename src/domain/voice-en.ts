// English counterpart of voice.ts: "start the laundry, cook lunch in the afternoon
// for 45 minutes, and tomorrow morning clean the bathroom, it's important".
import { LIMITS, type Category, type Period } from './model';
import type { DayRef, Draft } from './voice';

const NUM_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, 'forty-five': 45, fifty: 50, sixty: 60, ninety: 90
};
const DAYS: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };

interface Hint { words: string[]; category: Category; effort?: number; wait?: number; period?: Period }
const HINTS: Hint[] = [
  { words: ['laundry', 'washing machine', 'washer', 'wash clothes'], category: 'home', effort: 10, wait: 50 },
  { words: ['dryer', 'hang', 'fold', 'iron', 'ironing'], category: 'home', effort: 20 },
  { words: ['dough', 'bread', 'bake', 'baking', 'oven'], category: 'food', effort: 15, wait: 45 },
  { words: ['breakfast'], category: 'food', effort: 20, period: 'morning' },
  { words: ['lunch', 'cook', 'cooking', 'meal'], category: 'food', effort: 45, period: 'afternoon' },
  { words: ['dinner', 'supper'], category: 'food', effort: 30, period: 'evening' },
  { words: ['dishes', 'dishwasher', 'kitchen'], category: 'home', effort: 20 },
  { words: ['clean', 'tidy', 'vacuum', 'mop', 'bathroom', 'dust', 'sweep'], category: 'home', effort: 30 },
  { words: ['homework', 'study', 'kids', 'school', 'children'], category: 'kids', effort: 40, period: 'evening' },
  { words: ['buy', 'shop', 'shopping', 'groceries', 'grocery', 'pharmacy', 'market'], category: 'other', effort: 45 },
  { words: ['myself', 'rest', 'coffee', 'read', 'walk', 'pray', 'exercise', 'gym', 'nap'], category: 'self', effort: 20 }
];

const FILLERS = /^(?:i\s+(?:need|have|want|must|should)\s+to|i(?:'ll| will)|need to|have to|got to|gotta|i'?m going to|going to|remember to|please|and|then|also|so|ok(?:ay)?|um+|uh+)\s+/i;

/** Splits on punctuation and "then", "and then", "after that", "also". Plain "and" splits only before a verb-like word. */
function split(text: string): string[] {
  return text
    .split(/[.;!?\n]+|,\s*(?:and\s+)?|\s+(?:and then|then|after that|afterwards|also)\s+/i)
    .flatMap((p) => p.split(/\s+and\s+(?=(?:start|cook|clean|make|do|call|buy|take|wash|study|help|tidy|bake|go|pick|prepare|fold|iron|put|run)\b)/i))
    .map((s) => s.trim())
    .filter(Boolean);
}

function minutesIn(s: string): { effort: number | null; wait: number | null; rest: string } {
  let effort: number | null = null;
  let wait: number | null = null;
  let rest = s;
  const re = /\b(?:(wait(?:ing)?|let (?:it|them) (?:run|rest|sit|rise|bake|soak)|runs?)\s+(?:for\s+)?|(?:for|takes?|about|around)\s+)?(an hour and a half|half an hour|a quarter of an hour|quarter of an hour|(\d+(?:\.\d+)?|[a-z-]+)\s*(minutes?|mins?|m|hours?|hrs?|h))\b/gi;
  rest = rest.replace(re, (whole, waitCue: string | undefined, phrase: string, num: string | undefined, unit: string | undefined) => {
    let m: number | null = null;
    const p = phrase.toLowerCase();
    if (p === 'an hour and a half') m = 90;
    else if (p === 'half an hour') m = 30;
    else if (p.includes('quarter')) m = 15;
    else if (num && unit) {
      const n = /^\d/.test(num) ? Number(num) : NUM_WORDS[num.toLowerCase()];
      if (n === undefined || Number.isNaN(n)) return whole;
      m = /^h/i.test(unit) ? n * 60 : n;
    }
    if (m === null) return whole;
    if (waitCue && wait === null) wait = m;
    else if (effort === null) effort = m;
    else if (wait === null) wait = m;
    return ' ';
  });
  return { effort, wait, rest };
}

export function parseSpeechEn(text: string): Draft[] {
  const out: Draft[] = [];
  let inheritedDay: DayRef | null = null;
  let inheritedPeriod: Period | null = null;
  for (const seg of split(text)) {
    let s = ` ${seg} `;
    let day: DayRef | null = null;
    let period: Period | null = null;
    let priority = false;
    if (/\bday after tomorrow\b/i.test(s)) { day = { kind: 'offset', days: 2 }; s = s.replace(/\b(?:the\s+)?day after tomorrow\b/i, ' '); }
    else if (/\btomorrow\b/i.test(s)) { day = { kind: 'offset', days: 1 }; s = s.replace(/\btomorrow\b/i, ' '); }
    else if (/\btoday\b/i.test(s)) { day = { kind: 'offset', days: 0 }; s = s.replace(/\btoday\b/i, ' '); }
    else {
      const m = /\b(?:on\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i.exec(s);
      if (m) { day = { kind: 'weekday', day: DAYS[m[1].toLowerCase()] }; s = s.replace(m[0], ' '); }
    }
    const per: [RegExp, Period][] = [
      [/\b(?:in the |this )?morning\b/i, 'morning'],
      [/\b(?:in the |this )?afternoon\b|\bat noon\b|\bafter lunch\b/i, 'afternoon'],
      [/\b(?:in the |this )?evening\b|\btonight\b|\bat night\b|\bbefore bed\b/i, 'evening']
    ];
    for (const [re, p] of per) if (re.test(s)) { period = p; s = s.replace(re, ' '); break; }
    if (/\b(?:it'?s\s+)?(?:important|urgent|high priority|priority)\b/i.test(s)) {
      priority = true;
      s = s.replace(/\b(?:it'?s\s+)?(?:really\s+|very\s+)?(?:important|urgent|high priority|priority)\b/gi, ' ');
    }
    const { effort, wait, rest } = minutesIn(s);
    let title = rest.replace(/\s+/g, ' ').trim();
    for (let i = 0; i < 4; i++) title = title.replace(FILLERS, '');
    title = title.replace(/\s*(?:,|and|then|for|in|on|at)$/i, '').trim();

    // Leftovers like "it is" (from "it is important") or "let it rest" belong to the previous task.
    if (!title || /^(?:it(?:'s| is)?|this(?: is)?|that(?:'s| is)?|which is|very|really|wait(?:ing)?|it runs?|let (?:it|them) (?:run|rest|sit|rise|bake|soak))$/i.test(title)) {
      const prev = out[out.length - 1];
      if (prev && (wait ?? effort) !== null) { prev.wait = Math.min(LIMITS.waitMax, (wait ?? effort)!); prev.guessed.wait = false; }
      if (prev && priority) prev.priority = true;
      if (prev && period) { prev.period = period; prev.guessed.period = false; }
      if (day) inheritedDay = day;
      continue;
    }
    const lower = title.toLowerCase();
    const hint = HINTS.find((h) => h.words.some((w) => new RegExp(`\\b${w}\\b`).test(lower)));
    const resolvedPeriod = period ?? inheritedPeriod ?? hint?.period ?? 'morning';
    out.push({
      title: title.charAt(0).toUpperCase() + title.slice(1, LIMITS.title),
      effort: Math.min(LIMITS.effortMax, Math.max(LIMITS.effortMin, effort ?? hint?.effort ?? 15)),
      wait: Math.min(LIMITS.waitMax, wait ?? hint?.wait ?? 0),
      period: resolvedPeriod,
      category: hint?.category ?? 'home',
      priority,
      day: day ?? inheritedDay ?? { kind: 'offset', days: 0 },
      guessed: { effort: effort === null, wait: wait === null, period: period === null, category: true, day: day === null }
    });
    if (day) inheritedDay = day;
    if (period) inheritedPeriod = period;
  }
  return out;
}
