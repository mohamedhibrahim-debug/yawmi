// Pure domain operations. Every function mutates the DB passed in and never
// touches storage or the DOM; callers clone, apply, then persist atomically.
import {
  CATEGORIES, LIMITS, PERIODS, PERIOD_FLOOR, PERIOD_ORDER, uid,
  type Category, type DB, type Period, type Routine, type Task, type TaskFields
} from './model';
import { addDays, isDayKey, startOfDay, weekday, type DayKey } from './time';

/** A rule was broken. `code` is translated by the UI (see src/i18n). */
export class DomainError extends Error {
  constructor(public code: string, public params: Record<string, number | string> = {}) {
    super(code);
  }
}

// ---------- validation of user input ----------

export function cleanFields(input: Partial<TaskFields>): TaskFields {
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (!title) throw new DomainError('titleRequired');
  if (title.length > LIMITS.title) throw new DomainError('titleTooLong', { max: LIMITS.title });
  const effort = Math.round(Number(input.effort));
  if (!Number.isFinite(effort) || effort < LIMITS.effortMin || effort > LIMITS.effortMax)
    throw new DomainError('effortRange', { min: LIMITS.effortMin, max: LIMITS.effortMax });
  const wait = Math.round(Number(input.wait ?? 0));
  if (!Number.isFinite(wait) || wait < 0 || wait > LIMITS.waitMax)
    throw new DomainError('waitRange', { max: LIMITS.waitMax });
  const category = (input.category ?? 'home') as Category;
  if (!Object.hasOwn(CATEGORIES, category)) throw new DomainError('badCategory');
  const period = (input.period ?? 'morning') as Period;
  if (!Object.hasOwn(PERIODS, period)) throw new DomainError('badPeriod');
  const notes = typeof input.notes === 'string' ? input.notes : '';
  if (notes.length > LIMITS.notes) throw new DomainError('notesTooLong', { max: LIMITS.notes });
  return { title, category, effort, wait, priority: !!input.priority, period, notes };
}

function assertDay(date: string): asserts date is DayKey {
  if (!isDayKey(date)) throw new DomainError('badDate');
}

// ---------- tasks ----------

export function addTask(db: DB, fields: Partial<TaskFields>, date: DayKey): Task {
  assertDay(date);
  const f = cleanFields(fields);
  const task: Task = {
    ...f, id: uid(), date, originalDate: date, routineId: null,
    status: 'todo', completedAt: null, order: nextOrder(db, date)
  };
  db.tasks.push(task);
  return task;
}

function nextOrder(db: DB, date: DayKey): number {
  return db.tasks.filter((t) => t.date === date).reduce((m, t) => Math.max(m, t.order), 0) + 1;
}

export function updateTask(db: DB, id: string, fields: Partial<TaskFields>): void {
  const t = find(db, id);
  if (!t || t.status === 'deleted') return;
  Object.assign(t, cleanFields({ ...t, ...fields }));
  // A changed wait length invalidates a running wait.
  const w = db.waits.find((x) => x.taskId === id);
  if (w && t.wait === 0) db.waits = db.waits.filter((x) => x.taskId !== id);
}

function find(db: DB, id: string): Task | undefined {
  return db.tasks.find((t) => t.id === id);
}

export function dayTasks(db: DB, date: DayKey): Task[] {
  return db.tasks
    .filter((t) => t.date === date && t.status !== 'deleted')
    .sort((a, b) => periodIndex(a.period) - periodIndex(b.period) || a.order - b.order);
}

const periodIndex = (p: Period) => PERIOD_ORDER.indexOf(p);

/** Stops the running timer, recording a session. */
export function stop(db: DB, now = Date.now()): void {
  if (!db.active) return;
  const { taskId, start } = db.active;
  if (now > start) db.sessions.push({ id: uid(), taskId, start, end: now });
  db.active = null;
}

/** Starts a timer on a task; any other running timer is stopped first. */
export function start(db: DB, id: string, now = Date.now()): void {
  const t = find(db, id);
  if (!t || t.status !== 'todo' || db.active?.taskId === id) return;
  stop(db, now);
  clearWait(db, id);
  db.active = { taskId: id, start: now };
}

function clearWait(db: DB, id: string) {
  db.waits = db.waits.filter((w) => w.taskId !== id);
}

/**
 * Toggles done / todo. Completing stops its timer. If the task has waiting time
 * (washing machine, oven) and no wait is running, completing starts the wait:
 * her part is done and the machine is now working. Returns true when a wait started.
 */
export function toggleDone(db: DB, id: string, now = Date.now()): boolean {
  const t = find(db, id);
  if (!t || t.status === 'deleted') return false;
  if (db.active?.taskId === id) stop(db, now);
  t.status = t.status === 'done' ? 'todo' : 'done';
  t.completedAt = t.status === 'done' ? now : null;
  if (t.status === 'done' && t.wait > 0 && !db.waits.some((w) => w.taskId === id)) {
    db.waits.push({ taskId: id, start: now, end: now + t.wait * 60_000 });
    return true;
  }
  return false;
}

/** Unfinished tasks from days before `today`, oldest first. */
export function overdue(db: DB, today: DayKey): Task[] {
  return db.tasks.filter((t) => t.status === 'todo' && t.date < today).sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order);
}

/** Moves the given unfinished tasks to `today`. */
export function bringForward(db: DB, ids: string[], today: DayKey, now = Date.now()): void {
  for (const id of ids) move(db, id, today, now);
}

export function move(db: DB, id: string, date: DayKey, now = Date.now()): void {
  assertDay(date);
  const t = find(db, id);
  if (!t || t.status === 'deleted') return;
  if (db.active?.taskId === id) stop(db, now);
  clearWait(db, id);
  t.date = date;
  t.order = nextOrder(db, date);
}

export function remove(db: DB, id: string, now = Date.now()): void {
  const t = find(db, id);
  if (!t) return;
  if (db.active?.taskId === id) stop(db, now);
  clearWait(db, id);
  t.status = 'deleted';
}

export function restore(db: DB, id: string): void {
  const t = find(db, id);
  if (t && t.status === 'deleted') t.status = 'todo';
}

// ---------- waits (e.g. washing machine cycle) ----------

export function beginWait(db: DB, id: string, now = Date.now()): void {
  const t = find(db, id);
  if (!t || !t.wait || t.status !== 'todo') return;
  if (db.active?.taskId === id) stop(db, now);
  clearWait(db, id);
  db.waits.push({ taskId: id, start: now, end: now + t.wait * 60_000 });
}

export function cancelWait(db: DB, id: string): void {
  clearWait(db, id);
}

// ---------- time tracking ----------

/** Total tracked ms for a task: sessions + running timer + manual adjustments. */
export function trackedForTask(db: DB, id: string, now = Date.now()): number {
  const sessions = db.sessions.filter((s) => s.taskId === id).reduce((s, x) => s + (x.end - x.start), 0);
  const running = db.active?.taskId === id ? Math.max(0, now - db.active.start) : 0;
  const adj = db.adjustments.filter((a) => a.taskId === id).reduce((s, a) => s + a.deltaMinutes * 60_000, 0);
  return Math.max(0, sessions + running + adj);
}

/** Tracked ms within one planner-zone day: sessions clipped to that day plus that day's adjustments. */
export function trackedOnDay(db: DB, date: DayKey, now = Date.now()): number {
  const zone = db.settings.zone;
  const lo = startOfDay(date, zone);
  const hi = startOfDay(addDays(date, 1), zone);
  const rows = [...db.sessions, ...(db.active ? [{ ...db.active, end: now }] : [])];
  const clipped = rows.reduce((sum, s) => sum + Math.max(0, Math.min(hi, s.end) - Math.max(lo, s.start)), 0);
  const adj = db.adjustments.filter((a) => a.day === date).reduce((s, a) => s + a.deltaMinutes * 60_000, 0);
  return Math.max(0, clipped + adj);
}

/** Records a manual correction (positive or negative minutes) for a task on a day. */
export function adjustTime(db: DB, taskId: string, day: DayKey, deltaMinutes: number): void {
  assertDay(day);
  const delta = Math.round(deltaMinutes);
  if (!Number.isFinite(delta) || delta === 0 || Math.abs(delta) > LIMITS.adjustMax)
    throw new DomainError('badMinutes');
  if (!find(db, taskId)) return;
  db.adjustments.push({ id: uid(), taskId, day, deltaMinutes: delta });
}

// ---------- routines ----------

export function addRoutine(db: DB, fields: Partial<TaskFields>, days: number[], startDate: DayKey): Routine {
  assertDay(startDate);
  const r: Routine = { ...cleanFields(fields), id: uid(), enabled: true, start: startDate, days: cleanDays(days) };
  db.routines.push(r);
  return r;
}

export function updateRoutine(db: DB, id: string, fields: Partial<TaskFields>, days: number[], enabled: boolean): void {
  const r = db.routines.find((x) => x.id === id);
  if (!r) return;
  Object.assign(r, cleanFields({ ...r, ...fields }), { days: cleanDays(days), enabled });
}

export function deleteRoutine(db: DB, id: string): void {
  // Already-added tasks stay; they just stop being linked to a live routine.
  db.routines = db.routines.filter((r) => r.id !== id);
  for (const t of db.tasks) if (t.routineId === id) t.routineId = null;
}

function cleanDays(days: number[]): number[] {
  const set = [...new Set(days.map(Number))].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort();
  if (!set.length) throw new DomainError('pickDay');
  return set;
}

function routineApplies(r: Routine, date: DayKey): boolean {
  return r.enabled && date >= r.start && r.days.includes(weekday(date));
}

/** Deterministic id of a routine occurrence, so it can never be added twice. */
export function occurrenceId(routineId: string, date: DayKey): string {
  return `${routineId}_${date}`;
}

/** Writes the day's routine occurrences as real tasks. Idempotent. Returns true if anything changed. */
export function materialize(db: DB, date: DayKey): boolean {
  if (!isDayKey(date)) return false;
  let changed = false;
  for (const r of db.routines) {
    if (!routineApplies(r, date)) continue;
    const id = occurrenceId(r.id, date);
    // Any existing copy (moved, done, or deleted) blocks re-adding.
    if (db.tasks.some((t) => t.id === id || (t.routineId === r.id && t.originalDate === date))) continue;
    const { title, category, effort, wait, priority, period, notes } = r;
    db.tasks.push({
      title, category, effort, wait, priority, period, notes,
      id, date, originalDate: date, routineId: r.id, status: 'todo', completedAt: null, order: nextOrder(db, date)
    });
    changed = true;
  }
  return changed;
}

/** Routine occurrences that would appear on a future day, without writing them. */
export function routinePreview(db: DB, date: DayKey): Task[] {
  if (!isDayKey(date)) return [];
  const out: Task[] = [];
  for (const r of db.routines) {
    if (!routineApplies(r, date)) continue;
    if (db.tasks.some((t) => t.routineId === r.id && t.originalDate === date)) continue;
    const { title, category, effort, wait, priority, period, notes } = r;
    out.push({
      title, category, effort, wait, priority, period, notes,
      id: occurrenceId(r.id, date), date, originalDate: date, routineId: r.id,
      status: 'todo', completedAt: null, order: 1000
    });
  }
  return out;
}

// ---------- arranging the day ----------

export interface PlanRow {
  id: string;
  start: number; // minutes after midnight
  end: number;
  ready: number; // end + waiting time
  over: boolean; // exceeds capacity or spills past midnight
}

export const GAP_MINUTES = 10;

/**
 * Suggested order and times for the day's open tasks. Tasks currently waiting are left out.
 * Ordered by period, then priority, then manual order; each period has an earliest start.
 * `nowMinutes` (for today only) keeps suggestions from starting in the past.
 */
export function plan(db: DB, date: DayKey, nowMinutes?: number): PlanRow[] {
  const [hh, mm] = db.settings.start.split(':').map(Number);
  let cursor = Math.max(hh * 60 + mm, nowMinutes ?? 0);
  let effort = 0;
  const waiting = new Set(db.waits.map((w) => w.taskId));
  const tasks = dayTasks(db, date)
    .filter((t) => t.status === 'todo' && !waiting.has(t.id))
    .sort((a, b) => periodIndex(a.period) - periodIndex(b.period) || Number(b.priority) - Number(a.priority) || a.order - b.order);
  return tasks.map((t, i) => {
    cursor = Math.max(cursor, PERIOD_FLOOR[t.period]);
    const s = cursor;
    cursor += t.effort + (i < tasks.length - 1 ? GAP_MINUTES : 0);
    effort += t.effort;
    return { id: t.id, start: s, end: s + t.effort, ready: s + t.effort + t.wait, over: effort > db.settings.capacity || s + t.effort + t.wait > 1440 };
  });
}

export function plannedEffort(db: DB, date: DayKey): number {
  return dayTasks(db, date).filter((t) => t.status === 'todo').reduce((s, t) => s + t.effort, 0);
}
