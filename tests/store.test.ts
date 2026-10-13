import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { ConflictError, load, replaceAll, save } from '../src/storage/store';
import { addTask } from '../src/domain/ops';

describe('storage', () => {
  it('loads a fresh DB, saves with revision bumps, and rejects a stale writer', async () => {
    const { db, source } = await load();
    expect(source).toBe('fresh');
    expect(db.revision).toBe(0);

    const tabA = structuredClone(db);
    const tabB = structuredClone(db);
    addTask(tabA, { title: 'من التاب الأولى', effort: 10 }, '2026-10-13');
    const savedA = await save(tabA);
    expect(savedA.revision).toBe(1);

    // Tab B still thinks revision is 0, so its write must not overwrite A's.
    addTask(tabB, { title: 'من التاب التانية', effort: 10 }, '2026-10-13');
    await expect(save(tabB)).rejects.toBeInstanceOf(ConflictError);

    const reloaded = await load();
    expect(reloaded.db.tasks.map((t) => t.title)).toEqual(['من التاب الأولى']);

    // Import/reset replaces everything and still moves the revision forward.
    const replaced = await replaceAll({ ...reloaded.db, tasks: [] });
    expect(replaced.revision).toBe(2);
  });
});
