// Export / import with strict validation. Accepts this app's v2 files and the
// prototype's v1 export ({ app: 'yawmi-home', data: { version: 1, ... } }).
import { CATEGORIES, LIMITS, PERIODS, SCHEMA_VERSION, type DB } from './model';
import { deviceZone, isDayKey, isValidZone } from './time';

export const APP_ID = 'yawmi-home';
const MAX_ROWS = 20_000;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

export class ImportError extends Error {
  constructor(detail: string) {
    super(`الملف مش نسخة صالحة من يومي (${detail})`);
  }
}

export function exportEnvelope(db: DB, now = new Date()) {
  return { app: APP_ID, exportedAt: now.toISOString(), data: db };
}

export function exportFileName(now = new Date()): string {
  return `yawmi-backup-${now.toISOString().slice(0, 10)}.json`;
}

/** Parses and validates a backup file. Returns a brand-new DB or throws ImportError. */
export function parseBackup(text: string, zone = deviceZone()): DB {
  if (text.length > MAX_FILE_BYTES) throw new ImportError('الملف كبير جدًا');
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch {
    throw new ImportError('مش JSON');
  }
  if (!isObj(input) || input.app !== APP_ID || !isObj(input.data)) throw new ImportError('مش ملف يومي');
  const v = input.data.version;
  if (v === 1) return validate(migrateV1(input.data, zone));
  if (v === SCHEMA_VERSION) return validate(input.data);
  throw new ImportError(`إصدار ${String(v)} مش مدعوم`);
}

/** Prototype (v1) → v2: adds `adjustments` and a planner `zone`. Ids are kept as-is. */
export function migrateV1(d: Record<string, unknown>, zone = deviceZone()): Record<string, unknown> {
  const settings = isObj(d.settings) ? d.settings : {};
  return {
    ...d,
    version: SCHEMA_VERSION,
    settings: { ...settings, zone },
    adjustments: [],
    waits: Array.isArray(d.waits) ? d.waits : [],
    // The prototype stored manual edits as `slot` hints; not needed any more.
    tasks: Array.isArray(d.tasks) ? d.tasks.map((t) => (isObj(t) ? omit(t, 'slot') : t)) : d.tasks
  };
}

function omit(o: Record<string, unknown>, key: string) {
  const { [key]: _drop, ...rest } = o;
  void _drop;
  return rest;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function fail(why: string): never {
  throw new ImportError(why);
}

const ID_RE = /^[A-Za-z0-9_-]{1,120}$/;
const isId = (s: unknown): s is string => typeof s === 'string' && ID_RE.test(s);
const isInt = (v: unknown, min: number, max: number) => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
const isTime = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 4102444800000;

function checkFields(t: Record<string, unknown>, where: string) {
  if (typeof t.title !== 'string' || !t.title.trim() || t.title.length > LIMITS.title) fail(`${where}: الاسم`);
  if (typeof t.category !== 'string' || !Object.hasOwn(CATEGORIES, t.category)) fail(`${where}: القسم`);
  if (typeof t.period !== 'string' || !Object.hasOwn(PERIODS, t.period)) fail(`${where}: الوقت`);
  if (!isInt(t.effort, LIMITS.effortMin, LIMITS.effortMax)) fail(`${where}: المجهود`);
  if (!isInt(t.wait, 0, LIMITS.waitMax)) fail(`${where}: الانتظار`);
  if (typeof t.priority !== 'boolean') fail(`${where}: الأهمية`);
  if (typeof t.notes !== 'string' || t.notes.length > LIMITS.notes) fail(`${where}: الملاحظات`);
}

/** Full structural and referential validation. Returns a deep copy. */
export function validate(d: Record<string, unknown>): DB {
  if (d.version !== SCHEMA_VERSION) fail('الإصدار');
  if (!isInt(d.revision, 0, Number.MAX_SAFE_INTEGER)) fail('رقم المراجعة');
  const s = d.settings;
  if (!isObj(s)) fail('الإعدادات');
  const st = s as Record<string, unknown>;
  if (typeof st.name !== 'string' || st.name.length > LIMITS.name) fail('الاسم');
  if (!isInt(st.capacity, LIMITS.capacityMin, LIMITS.capacityMax)) fail('الوقت المتاح');
  if (typeof st.start !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(st.start)) fail('بداية اليوم');
  if (typeof st.onboarded !== 'boolean') fail('الإعدادات');
  if (!isValidZone(st.zone)) fail('المنطقة الزمنية');

  for (const key of ['tasks', 'routines', 'sessions', 'adjustments', 'waits'])
    if (!Array.isArray(d[key]) || (d[key] as unknown[]).length > MAX_ROWS) fail(key);

  const routineIds = new Set<string>();
  for (const r of d.routines as unknown[]) {
    if (!isObj(r) || !isId(r.id) || routineIds.has(r.id)) fail('روتين');
    const rr = r as Record<string, unknown>;
    checkFields(rr, 'روتين');
    if (typeof rr.enabled !== 'boolean' || !isDayKey(rr.start)) fail('روتين');
    const days = rr.days;
    if (!Array.isArray(days) || !days.length || days.some((n) => !isInt(n, 0, 6)) || new Set(days).size !== days.length) fail('أيام الروتين');
    routineIds.add(rr.id as string);
  }

  const taskIds = new Set<string>();
  const taskStatus = new Map<string, string>();
  const occurrences = new Set<string>();
  for (const t of d.tasks as unknown[]) {
    if (!isObj(t) || !isId(t.id) || taskIds.has(t.id)) fail('مهمة');
    const tt = t as Record<string, unknown>;
    checkFields(tt, 'مهمة');
    if (!isDayKey(tt.date) || !isDayKey(tt.originalDate)) fail('تاريخ مهمة');
    if (!['todo', 'done', 'deleted'].includes(tt.status as string)) fail('حالة مهمة');
    if (typeof tt.order !== 'number' || !Number.isFinite(tt.order)) fail('ترتيب مهمة');
    if (tt.completedAt !== null && !isTime(tt.completedAt)) fail('وقت الإنهاء');
    if (tt.routineId !== null) {
      // A routine may have been deleted since; keep the task but unlink it.
      if (typeof tt.routineId !== 'string') fail('روتين المهمة');
      if (!routineIds.has(tt.routineId as string)) tt.routineId = null;
      else {
        const k = `${tt.routineId}:${tt.originalDate}`;
        if (occurrences.has(k)) fail('روتين متكرر');
        occurrences.add(k);
      }
    }
    taskIds.add(tt.id as string);
    taskStatus.set(tt.id as string, tt.status as string);
  }

  const sessionIds = new Set<string>();
  for (const x of d.sessions as unknown[]) {
    if (!isObj(x) || !isId(x.id) || sessionIds.has(x.id) || !taskIds.has(x.taskId as string)) fail('جلسة');
    if (!isTime(x.start) || !isTime(x.end) || (x.end as number) < (x.start as number)) fail('وقت جلسة');
    sessionIds.add(x.id as string);
  }

  const adjIds = new Set<string>();
  for (const a of d.adjustments as unknown[]) {
    if (!isObj(a) || !isId(a.id) || adjIds.has(a.id) || !taskIds.has(a.taskId as string)) fail('تعديل وقت');
    if (!isDayKey(a.day) || !Number.isInteger(a.deltaMinutes) || a.deltaMinutes === 0 || Math.abs(a.deltaMinutes as number) > LIMITS.adjustMax) fail('تعديل وقت');
    adjIds.add(a.id as string);
  }

  const active = d.active;
  if (active !== null) {
    if (!isObj(active) || !taskIds.has(active.taskId as string) || !isTime(active.start) || taskStatus.get(active.taskId as string) !== 'todo') fail('المؤقت');
  }

  const waitIds = new Set<string>();
  for (const w of d.waits as unknown[]) {
    if (!isObj(w) || !taskIds.has(w.taskId as string) || waitIds.has(w.taskId as string)) fail('انتظار');
    if (!isTime(w.start) || !isTime(w.end) || (w.end as number) < (w.start as number)) fail('انتظار');
    if (isObj(active) && active.taskId === w.taskId) fail('انتظار');
    if (taskStatus.get(w.taskId as string) !== 'todo') fail('انتظار');
    waitIds.add(w.taskId as string);
  }

  return structuredClone(d) as unknown as DB;
}
