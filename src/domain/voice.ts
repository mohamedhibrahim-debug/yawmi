// Turns what she says (Egyptian Arabic, from speech-to-text or typing) into draft tasks.
// Example: «عايزة أشغل الغسالة وأطبخ الغدا بعد الضهر وأذاكر للولاد بالليل ساعة»
// → 3 drafts. Every value that was guessed rather than heard is flagged, so the
// review screen can show it as a suggestion she can change.
import { LIMITS, type Category, type Period } from './model';

export type DayRef = { kind: 'offset'; days: number } | { kind: 'weekday'; day: number };

export interface Draft {
  title: string;
  effort: number;
  wait: number;
  period: Period;
  category: Category;
  priority: boolean;
  day: DayRef;
  /** Which fields were guessed (not said explicitly). */
  guessed: { effort: boolean; wait: boolean; period: boolean; category: boolean; day: boolean };
}

// ---------- normalization ----------

const DIGITS: Record<string, string> = {
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9'
};

/** Normalized form used only for matching; titles keep her original words. */
export function norm(s: string): string {
  return s
    .replace(/[ً-ْٰـ]/g, '') // harakat, tatweel
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[٠-٩۰-۹]/g, (d) => DIGITS[d])
    .toLowerCase();
}

// ---------- numbers and durations ----------

const UNITS: Record<string, number> = {
  واحد: 1, واحده: 1, اتنين: 2, اثنين: 2, تلاته: 3, ثلاثه: 3, تلات: 3, اربعه: 4, اربع: 4, خمسه: 5, خمس: 5,
  سته: 6, ست: 6, سبعه: 7, سبع: 7, تمانيه: 8, ثمانيه: 8, تمن: 8, تسعه: 9, تسع: 9, عشره: 10, عشر: 10,
  حداشر: 11, اتناشر: 12, تلتاشر: 13, اربعتاشر: 14, خمستاشر: 15, ستاشر: 16, سبعتاشر: 17, تمنتاشر: 18, تسعتاشر: 19
};
const TENS: Record<string, number> = {
  عشرين: 20, تلاتين: 30, ثلاثين: 30, اربعين: 40, خمسين: 50, ستين: 60, سبعين: 70, تمانين: 80, ثمانين: 80, تسعين: 90
};

function numberAt(tokens: string[], i: number): { value: number; len: number } | null {
  const t = tokens[i];
  if (t === undefined) return null;
  if (/^\d+$/.test(t)) return { value: Number(t), len: 1 };
  if (t in TENS) return { value: TENS[t], len: 1 };
  if (t in UNITS) {
    // «خمسه وعشرين»
    const next = tokens[i + 1];
    if (next && next.startsWith('و') && next.slice(1) in TENS) return { value: UNITS[t] + TENS[next.slice(1)], len: 2 };
    return { value: UNITS[t], len: 1 };
  }
  return null;
}

const MINUTE_WORDS = new Set(['دقيقه', 'دقايق', 'دقائق', 'دقيقة', 'دقيقتين', 'د', 'دقيقي', 'دقيق']);
const HOUR_WORDS = new Set(['ساعه', 'ساعات', 'ساعتين']);

interface Duration { minutes: number; start: number; len: number }

/** Finds durations in normalized tokens. */
function findDurations(t: string[]): Duration[] {
  const out: Duration[] = [];
  for (let i = 0; i < t.length; i++) {
    // fractions of an hour: ربع / نص / تلت ساعه
    if (['ربع', 'نص', 'نصف', 'تلت', 'ثلث'].includes(t[i]) && HOUR_WORDS.has(t[i + 1])) {
      out.push({ minutes: { ربع: 15, نص: 30, نصف: 30, تلت: 20, ثلث: 20 }[t[i]]!, start: i, len: 2 });
      i += 1;
      continue;
    }
    if (t[i] === 'دقيقتين') { out.push({ minutes: 2, start: i, len: 1 }); continue; }
    if (t[i] === 'ساعتين' || t[i] === 'ساعه' || t[i] === 'ساعات') {
      // bare «ساعه» / «ساعتين», possibly followed by «ونص» / «وربع» / «الا ربع»
      let m = t[i] === 'ساعتين' ? 120 : 60;
      let len = 1;
      if (t[i + 1] === 'ونص' || t[i + 1] === 'ونصف') { m += 30; len = 2; }
      else if (t[i + 1] === 'وربع') { m += 15; len = 2; }
      else if (t[i + 1] === 'وتلت' || t[i + 1] === 'وثلث') { m += 20; len = 2; }
      else if ((t[i + 1] === 'الا' || t[i + 1] === 'إلا') && t[i + 2] === 'ربع') { m -= 15; len = 3; }
      if (t[i] !== 'ساعات') { out.push({ minutes: m, start: i, len }); i += len - 1; continue; }
    }
    const num = numberAt(t, i);
    if (num) {
      const unit = t[i + num.len];
      if (unit && MINUTE_WORDS.has(unit)) {
        out.push({ minutes: num.value, start: i, len: num.len + 1 });
        i += num.len;
        continue;
      }
      if (unit && HOUR_WORDS.has(unit)) {
        let m = num.value * 60;
        let len = num.len + 1;
        if (t[i + len] === 'ونص') { m += 30; len += 1; }
        out.push({ minutes: m, start: i, len });
        i += len - 1;
      }
    }
  }
  return out;
}

// ---------- keyword knowledge ----------

const WAIT_CUES = ['تستني', 'يستني', 'استني', 'هتستني', 'هيستني', 'انتظار', 'تفضل', 'يفضل', 'دوره', 'تشتغل', 'يشتغل', 'لوحده', 'لوحدها', 'يرتاح', 'يخمر', 'تخمر'];

interface Hint { words: string[]; category?: Category; effort?: number; wait?: number; period?: Period }
const HINTS: Hint[] = [
  { words: ['غساله', 'الغساله', 'غسيل', 'الغسيل'], category: 'home', effort: 10, wait: 50 },
  { words: ['انشر', 'نشر', 'الهدوم', 'هدوم', 'اكوي', 'كوي', 'اطبق'], category: 'home', effort: 20 },
  { words: ['عجين', 'العجين', 'عجينه', 'اعجن'], category: 'food', effort: 15, wait: 60 },
  { words: ['فرن', 'الفرن'], category: 'food', effort: 15, wait: 40 },
  { words: ['فطار', 'الفطار', 'الفطور'], category: 'food', effort: 20, period: 'morning' },
  { words: ['غدا', 'الغدا', 'الغداء', 'اطبخ', 'طبخ', 'الطبيخ', 'اكل', 'الاكل', 'اسخن'], category: 'food', effort: 45, period: 'afternoon' },
  { words: ['عشا', 'العشا', 'العشاء'], category: 'food', effort: 30, period: 'evening' },
  { words: ['مواعين', 'المواعين', 'اطباق', 'الاطباق', 'المطبخ'], category: 'home', effort: 20 },
  { words: ['انضف', 'تنضيف', 'نضافه', 'امسح', 'مسح', 'اكنس', 'كنس', 'اروق', 'ترويق', 'الحمام', 'الارض', 'السجاد', 'الشقه', 'اوضه', 'الاوضه'], category: 'home', effort: 30 },
  { words: ['اذاكر', 'مذاكره', 'المذاكره', 'واجب', 'الواجب', 'المدرسه', 'الولاد', 'للولاد', 'العيال', 'للعيال', 'التمرين', 'الدرس'], category: 'kids', effort: 40, period: 'evening' },
  { words: ['الشنط', 'شنط', 'الشنطه', 'اللانش'], category: 'kids', effort: 15, period: 'evening' },
  { words: ['اشتري', 'السوق', 'طلبات', 'الطلبات', 'السوبرماركت', 'سوبرماركت', 'الخضار', 'العيش', 'الصيدليه'], category: 'other', effort: 45 },
  { words: ['لنفسي', 'ارتاح', 'راحه', 'قهوه', 'شاي', 'اقرا', 'اصلي', 'رياضه', 'امشي', 'تمشيه', 'اتكلم'], category: 'self', effort: 20 }
];

const PERIOD_PHRASES: { words: string[]; period: Period }[] = [
  { words: ['بعد', 'الضهر'], period: 'afternoon' },
  { words: ['بعد', 'الظهر'], period: 'afternoon' },
  { words: ['قبل', 'النوم'], period: 'evening' },
  { words: ['الصبح'], period: 'morning' },
  { words: ['الصبحيه'], period: 'morning' },
  { words: ['صباحا'], period: 'morning' },
  { words: ['بدري'], period: 'morning' },
  { words: ['الضهر'], period: 'afternoon' },
  { words: ['الظهر'], period: 'afternoon' },
  { words: ['الضهريه'], period: 'afternoon' },
  { words: ['العصر'], period: 'afternoon' },
  { words: ['بالليل'], period: 'evening' },
  { words: ['بليل'], period: 'evening' },
  { words: ['الليل'], period: 'evening' },
  { words: ['المغرب'], period: 'evening' },
  { words: ['مساء'], period: 'evening' }
];

const WEEKDAY_WORDS: Record<string, number> = {
  الحد: 0, الاحد: 0, الاتنين: 1, الاثنين: 1, التلات: 2, الثلاثاء: 2, التلاتاء: 2, الاربع: 3, الاربعاء: 3,
  الخميس: 4, الجمعه: 5, السبت: 6
};

const PRIORITY_WORDS = new Set(['مهم', 'مهمه', 'ضروري', 'ضروريه', 'اولويه', 'مستعجل', 'مستعجله']);
const LEADING_FILLERS = new Set([
  'عايزه', 'عاوزه', 'عايز', 'عاوز', 'محتاجه', 'محتاج', 'لازم', 'ناويه', 'المفروض', 'انا', 'كمان', 'ف', 'و',
  'حاجه', 'يعني', 'اول', 'حاجه:', 'النهارده', 'بكره'
]);
const EDGE_JUNK = new Set(['و', 'في', 'علي', 'لمده', 'حوالي', 'تقريبا', 'ف', 'يوم', 'مع', 'ل', 'من', 'كده', 'كدا', 'بقي']);

const GLUE_KEYWORDS = new Set<string>([
  'بكره', 'بكرا', 'النهارده', 'انهارده', 'النهاردا', 'بعد', 'قبل', 'يوم',
  ...PERIOD_PHRASES.flatMap((p) => p.words), ...Object.keys(WEEKDAY_WORDS), ...PRIORITY_WORDS, ...LEADING_FILLERS
]);

// ---------- splitting into tasks ----------

const SEPARATORS = /[،,؛;.!؟?\n]+|\s+(?:وبعدين|وبعد كده|وبعد كدا|وبعدها|بعد كده|بعد كدا|وكمان|ثم)\s+/;

/** Splits on punctuation, explicit "and then" words, and «و» + a first-person verb («وأطبخ»). */
function splitSegments(text: string): string[] {
  const out: string[] = [];
  for (const part of text.split(SEPARATORS)) {
    const words = part.trim().split(/\s+/).filter(Boolean);
    let cur: string[] = [];
    for (const w of words) {
      const n = norm(w);
      const rest = n.slice(1);
      const isNewVerb =
        n.startsWith('و') && rest.length >= 3 && rest.startsWith('ا') && !rest.startsWith('ال') &&
        !rest.startsWith('الا') && cur.length > 0 && !(rest in WEEKDAY_WORDS) && !(rest in TENS) && !(rest in UNITS);
      if (isNewVerb) {
        out.push(cur.join(' '));
        cur = [w.replace(/^و/, '')];
      } else cur.push(w);
    }
    if (cur.length) out.push(cur.join(' '));
  }
  return out.map((s) => s.trim()).filter(Boolean);
}

// ---------- main ----------

export function parseSpeech(text: string): Draft[] {
  const drafts: Draft[] = [];
  let inheritedDay: DayRef | null = null;
  let inheritedPeriod: Period | null = null;

  for (const seg of splitSegments(text)) {
    const orig = seg.split(/\s+/);
    // «وبكرة», «والصبح», «ومهم»: a glued «و» shouldn't hide a keyword.
    const t = orig.map(norm).map((w) => (w.length > 2 && w.startsWith('و') && GLUE_KEYWORDS.has(w.slice(1)) ? w.slice(1) : w));
    const used = new Array(t.length).fill(false);
    const mark = (i: number, len = 1) => { for (let k = i; k < i + len; k++) used[k] = true; };

    // day
    let day: DayRef | null = null;
    for (let i = 0; i < t.length; i++) {
      if ((t[i] === 'بعد') && (t[i + 1] === 'بكره' || t[i + 1] === 'بكرا')) { day = { kind: 'offset', days: 2 }; mark(i, 2); break; }
      if (t[i] === 'بكره' || t[i] === 'بكرا') { day = { kind: 'offset', days: 1 }; mark(i); break; }
      if (t[i] === 'النهارده' || t[i] === 'انهارده' || t[i] === 'النهارده،' || t[i] === 'النهاردا') { day = { kind: 'offset', days: 0 }; mark(i); break; }
      if (t[i] in WEEKDAY_WORDS) { day = { kind: 'weekday', day: WEEKDAY_WORDS[t[i]] }; mark(i); if (t[i - 1] === 'يوم') mark(i - 1); break; }
    }

    // period (longest phrases first, as listed)
    let period: Period | null = null;
    outer: for (const p of PERIOD_PHRASES) {
      for (let i = 0; i + p.words.length <= t.length; i++) {
        if (p.words.every((w, k) => t[i + k] === w && !used[i + k])) {
          period = p.period;
          mark(i, p.words.length);
          break outer;
        }
      }
    }

    // priority
    let priority = false;
    t.forEach((w, i) => { if (PRIORITY_WORDS.has(w)) { priority = true; mark(i); } });

    // durations: one after a wait cue is the wait; otherwise first = effort, second = wait
    const durs = findDurations(t).filter((d) => !used[d.start]);
    let effort: number | null = null;
    let wait: number | null = null;
    for (const d of durs) {
      const before = t.slice(Math.max(0, d.start - 3), d.start);
      const isWait = before.some((w) => WAIT_CUES.includes(w));
      if (isWait && wait === null) wait = d.minutes;
      else if (effort === null) effort = d.minutes;
      else if (wait === null) wait = d.minutes;
      mark(d.start, d.len);
    }
    // consume wait-cue words and filler like «حوالي» next to durations
    t.forEach((w, i) => { if (WAIT_CUES.includes(w) && (wait !== null)) mark(i); });

    // title = her remaining words, trimmed of fillers at the edges
    let words = orig.filter((_, i) => !used[i]);
    const nwords = () => words.map(norm);
    while (words.length && (LEADING_FILLERS.has(nwords()[0]) || EDGE_JUNK.has(nwords()[0]))) words = words.slice(1);
    while (words.length && EDGE_JUNK.has(nwords()[words.length - 1])) words = words.slice(0, -1);
    if (words.length) words[0] = words[0].replace(/^و(?=[اأإآ])/, '');
    const title = words.join(' ').replace(/\s+/g, ' ').trim();

    // A segment with no title but a duration («وبعدين يستني ساعة») belongs to the previous task.
    if (!title) {
      const prev = drafts[drafts.length - 1];
      if (prev) {
        if (wait !== null) { prev.wait = clamp(wait, 0, LIMITS.waitMax); prev.guessed.wait = false; }
        else if (effort !== null) { prev.wait = clamp(effort, 0, LIMITS.waitMax); prev.guessed.wait = false; }
        if (period) { prev.period = period; prev.guessed.period = false; }
        if (priority) prev.priority = true;
      }
      if (day) inheritedDay = day;
      continue;
    }

    // hints from keywords in the whole segment
    const hint = HINTS.find((h) => h.words.some((w) => t.includes(w)));
    const resolvedDay = day ?? inheritedDay;
    const resolvedPeriod = period ?? inheritedPeriod ?? hint?.period ?? null;
    drafts.push({
      title: title.slice(0, LIMITS.title),
      effort: clamp(effort ?? hint?.effort ?? 15, LIMITS.effortMin, LIMITS.effortMax),
      wait: clamp(wait ?? hint?.wait ?? 0, 0, LIMITS.waitMax),
      period: resolvedPeriod ?? 'morning',
      category: hint?.category ?? 'home',
      priority,
      day: resolvedDay ?? { kind: 'offset', days: 0 },
      guessed: {
        effort: effort === null,
        wait: wait === null,
        period: period === null,
        category: true,
        day: day === null
      }
    });
    if (day) inheritedDay = day;
    if (period) inheritedPeriod = period;
  }
  return drafts;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, Math.round(v)));
}

/** Resolves a spoken day to a calendar offset from today (0 = today). Weekdays mean the next one, today included. */
export function dayOffset(ref: DayRef, todayWeekday: number): number {
  if (ref.kind === 'offset') return ref.days;
  return (ref.day - todayWeekday + 7) % 7;
}
