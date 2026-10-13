import { describe, expect, it } from 'vitest';
import { freshDB, type DB } from '../src/domain/model';
import {
  addRoutine, addTask, adjustTime, beginWait, cleanFields, deleteRoutine, DomainError, materialize, move, plan,
  plannedEffort, remove, restore, routinePreview, start, stop, toggleDone, trackedForTask, trackedOnDay, updateTask
} from '../src/domain/ops';
import { exportEnvelope, ImportError, parseBackup } from '../src/domain/io';
import { addDays, dayKeyAt, isDayKey, startOfDay, weekday } from '../src/domain/time';

const ZONE = 'Africa/Cairo';
const D = '2026-10-13'; // a Tuesday
const db0 = (): DB => freshDB(ZONE);
const base = { title: 'غسيل', effort: 10, category: 'home' as const, period: 'morning' as const, wait: 0, priority: false, notes: '' };

describe('time', () => {
  it('validates real calendar dates only', () => {
    expect(isDayKey('2026-02-28')).toBe(true);
    expect(isDayKey('2026-02-29')).toBe(false);
    expect(isDayKey('2028-02-29')).toBe(true);
    expect(isDayKey('2026-13-01')).toBe(false);
    expect(isDayKey('26-1-1')).toBe(false);
  });
  it('does calendar math without DST drift', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(weekday(D)).toBe(2);
  });
  it('finds the start of a day in a zone, including a DST gap at midnight', () => {
    const s = startOfDay(D, ZONE);
    expect(dayKeyAt(s, ZONE)).toBe(D);
    expect(dayKeyAt(s - 1, ZONE)).toBe('2026-10-12');
    // Egypt's 2026 spring-forward is the last Friday of April at 00:00 → the day starts at 01:00.
    const gapDay = '2026-04-24';
    const g = startOfDay(gapDay, ZONE);
    expect(dayKeyAt(g, ZONE)).toBe(gapDay);
    expect(dayKeyAt(g - 1, ZONE)).toBe('2026-04-23');
    // That day has 23 hours.
    expect(startOfDay(addDays(gapDay, 1), ZONE) - g).toBe(23 * 3600_000);
  });
});

describe('tasks', () => {
  it('rejects bad input with a readable Arabic message', () => {
    expect(() => cleanFields({ ...base, title: '  ' })).toThrow(DomainError);
    expect(() => cleanFields({ ...base, effort: 0 })).toThrow(DomainError);
    expect(() => cleanFields({ ...base, wait: 9999 })).toThrow(DomainError);
    expect(() => cleanFields({ ...base, category: 'x' as never })).toThrow(DomainError);
  });

  it('only one timer runs; completing stops it and records the session', () => {
    const db = db0();
    const a = addTask(db, base, D);
    const b = addTask(db, { ...base, title: 'طبخ' }, D);
    start(db, a.id, 1000);
    start(db, b.id, 61_000); // switches timer
    expect(db.active?.taskId).toBe(b.id);
    expect(db.sessions).toHaveLength(1);
    toggleDone(db, b.id, 121_000);
    expect(db.active).toBeNull();
    expect(trackedForTask(db, a.id)).toBe(60_000);
    expect(trackedForTask(db, b.id)).toBe(60_000);
  });

  it('a running wait is cleared by start, move, complete, and delete', () => {
    const db = db0();
    const t = addTask(db, { ...base, wait: 50 }, D);
    for (const action of [
      () => start(db, t.id, 5), () => move(db, t.id, addDays(D, 1), 5), () => remove(db, t.id, 5)
    ]) {
      beginWait(db, t.id, 0);
      action();
      expect(db.waits).toHaveLength(0);
      restore(db, t.id);
      stop(db, 10);
    }
  });

  it('delete is soft and can be undone', () => {
    const db = db0();
    const t = addTask(db, base, D);
    remove(db, t.id);
    expect(plannedEffort(db, D)).toBe(0);
    restore(db, t.id);
    expect(plannedEffort(db, D)).toBe(10);
  });

  it('turning wait off cancels a running wait', () => {
    const db = db0();
    const t = addTask(db, { ...base, wait: 30 }, D);
    beginWait(db, t.id, 0);
    updateTask(db, t.id, { wait: 0 });
    expect(db.waits).toHaveLength(0);
  });
});

describe('time tracking', () => {
  it('clips sessions to the planner-zone day and adds that day\'s adjustments', () => {
    const db = db0();
    const t = addTask(db, base, D);
    const midnight = startOfDay(addDays(D, 1), ZONE);
    db.sessions.push({ id: 's1', taskId: t.id, start: midnight - 30 * 60_000, end: midnight + 20 * 60_000 });
    expect(trackedOnDay(db, D)).toBe(30 * 60_000);
    expect(trackedOnDay(db, addDays(D, 1))).toBe(20 * 60_000);
    adjustTime(db, t.id, D, 15);
    expect(trackedOnDay(db, D)).toBe(45 * 60_000);
    expect(trackedOnDay(db, addDays(D, 1))).toBe(20 * 60_000);
    adjustTime(db, t.id, D, -100);
    expect(trackedOnDay(db, D)).toBe(0); // never negative
    expect(() => adjustTime(db, t.id, D, 0)).toThrow(DomainError);
  });
});

describe('routines', () => {
  it('materializes once, even after the task is moved or deleted', () => {
    const db = db0();
    const r = addRoutine(db, base, [weekday(D)], D);
    expect(materialize(db, D)).toBe(true);
    expect(materialize(db, D)).toBe(false);
    const task = db.tasks[0];
    expect(task.routineId).toBe(r.id);
    move(db, task.id, addDays(D, 1));
    expect(materialize(db, D)).toBe(false);
    remove(db, task.id);
    expect(materialize(db, D)).toBe(false);
    expect(db.tasks).toHaveLength(1);
  });

  it('previews future occurrences without writing them, and hides ones already handled', () => {
    const db = db0();
    const next = addDays(D, 7);
    addRoutine(db, base, [weekday(D)], D);
    expect(routinePreview(db, next)).toHaveLength(1);
    expect(db.tasks).toHaveLength(0);
    materialize(db, next);
    expect(routinePreview(db, next)).toHaveLength(0);
    // Disabled or not-yet-started routines do not preview.
    expect(routinePreview(db, addDays(D, -7))).toHaveLength(0);
  });

  it('deleting a routine keeps its existing tasks', () => {
    const db = db0();
    const r = addRoutine(db, base, [weekday(D)], D);
    materialize(db, D);
    deleteRoutine(db, r.id);
    expect(db.tasks).toHaveLength(1);
    expect(db.tasks[0].routineId).toBeNull();
  });

  it('requires at least one day', () => {
    expect(() => addRoutine(db0(), base, [], D)).toThrow(DomainError);
  });
});

describe('plan', () => {
  it('orders by period, then priority; respects period floors, gaps, and capacity', () => {
    const db = db0();
    db.settings.capacity = 60;
    const eve = addTask(db, { ...base, title: 'مذاكرة', period: 'evening', effort: 40 }, D);
    const m1 = addTask(db, { ...base, title: 'صبح ١', effort: 20 }, D);
    const m2 = addTask(db, { ...base, title: 'صبح مهمة', effort: 10, priority: true }, D);
    const rows = plan(db, D);
    expect(rows.map((r) => r.id)).toEqual([m2.id, m1.id, eve.id]);
    expect(rows[0].start).toBe(9 * 60);
    expect(rows[1].start).toBe(9 * 60 + 10 + 10);
    expect(rows[2].start).toBe(17 * 60);
    expect(rows[2].over).toBe(true); // 70 > 60 capacity
  });

  it('never suggests a start in the past for today, and skips waiting tasks', () => {
    const db = db0();
    const a = addTask(db, base, D);
    const w = addTask(db, { ...base, title: 'غسالة', wait: 50 }, D);
    beginWait(db, w.id, 0);
    const rows = plan(db, D, 14 * 60);
    expect(rows.map((r) => r.id)).toEqual([a.id]);
    expect(rows[0].start).toBe(14 * 60);
  });

  it('done tasks are not planned', () => {
    const db = db0();
    const a = addTask(db, base, D);
    toggleDone(db, a.id);
    expect(plan(db, D)).toHaveLength(0);
  });
});

describe('import / export', () => {
  it('round-trips its own export', () => {
    const db = db0();
    const t = addTask(db, base, D);
    start(db, t.id, 1000);
    stop(db, 5000);
    adjustTime(db, t.id, D, 5);
    addRoutine(db, base, [1, 3], D);
    const back = parseBackup(JSON.stringify(exportEnvelope(db)), ZONE);
    expect(back).toEqual(db);
  });

  it('imports the prototype (v1) format and keeps ids', () => {
    const v1 = {
      app: 'yawmi-home',
      exportedAt: '2026-10-13T10:00:00.000Z',
      data: {
        version: 1, revision: 4,
        settings: { name: 'منى', capacity: 180, start: '09:00', onboarded: true },
        tasks: [{ id: 'abc-1', title: 'تشغيل الغسالة', category: 'home', effort: 10, wait: 50, priority: false, period: 'morning', notes: '', date: D, originalDate: D, routineId: null, status: 'todo', completedAt: null, order: 0, slot: 'x' }],
        routines: [],
        sessions: [{ id: 's-1', taskId: 'abc-1', start: 1000, end: 2000 }],
        waits: [{ taskId: 'abc-1', start: 0, end: 3000000 }],
        active: null
      }
    };
    const db = parseBackup(JSON.stringify(v1), ZONE);
    expect(db.version).toBe(2);
    expect(db.settings.zone).toBe(ZONE);
    expect(db.tasks[0].id).toBe('abc-1');
    expect('slot' in db.tasks[0]).toBe(false);
    expect(db.adjustments).toEqual([]);
  });

  it('rejects malformed, foreign, and inconsistent files', () => {
    const good = exportEnvelope(db0());
    expect(() => parseBackup('not json')).toThrow(ImportError);
    expect(() => parseBackup(JSON.stringify({ app: 'other', data: {} }))).toThrow(ImportError);
    expect(() => parseBackup(JSON.stringify({ ...good, data: { ...good.data, version: 99 } }))).toThrow(ImportError);
    const db = db0();
    const t = addTask(db, base, D);
    const bad = structuredClone(db);
    bad.sessions.push({ id: 's', taskId: 'missing', start: 1, end: 2 });
    expect(() => parseBackup(JSON.stringify(exportEnvelope(bad)))).toThrow(ImportError);
    const bad2 = structuredClone(db);
    bad2.tasks.push({ ...t }); // duplicate id
    expect(() => parseBackup(JSON.stringify(exportEnvelope(bad2)))).toThrow(ImportError);
    const bad3 = structuredClone(db);
    bad3.settings.zone = 'Not/AZone';
    expect(() => parseBackup(JSON.stringify(exportEnvelope(bad3)))).toThrow(ImportError);
  });
});
