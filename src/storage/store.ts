// IndexedDB persistence. The whole DB is one record written in a single
// transaction, so a save either fully happens or not at all. A revision check
// inside the same transaction stops two open tabs from overwriting each other.
import { openDB, type IDBPDatabase } from 'idb';
import { freshDB, type DB } from '../domain/model';
import { migrateV1, validate } from '../domain/io';

const DB_NAME = 'yawmi';
const STORE = 'state';
const KEY = 'db';
const LEGACY_KEY = 'yawmi-home-app-v1'; // prototype's localStorage key

export class ConflictError extends Error {
  constructor() {
    super('conflict');
  }
}

let conn: Promise<IDBPDatabase> | null = null;
function idb() {
  conn ??= openDB(DB_NAME, 1, {
    upgrade(d) {
      if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);
    },
    blocking() {
      // A newer version of the app wants to upgrade; let it.
      void conn?.then((c) => c.close());
      conn = null;
    }
  });
  return conn;
}

export interface LoadResult {
  db: DB;
  source: 'stored' | 'legacy' | 'fresh' | 'recovered';
}

export async function load(): Promise<LoadResult> {
  const d = await idb();
  const raw = await d.get(STORE, KEY);
  if (raw) {
    try {
      return { db: validate(raw), source: 'stored' };
    } catch {
      // Keep the unreadable copy aside instead of overwriting it.
      await d.put(STORE, raw, `unreadable-${Date.now()}`);
      const db = freshDB();
      await d.put(STORE, db, KEY);
      return { db, source: 'recovered' };
    }
  }
  const legacy = readLegacy();
  const db = legacy ?? freshDB();
  await d.put(STORE, db, KEY);
  return { db, source: legacy ? 'legacy' : 'fresh' };
}

function readLegacy(): DB | null {
  try {
    const text = globalThis.localStorage?.getItem(LEGACY_KEY);
    if (!text) return null;
    const db = validate(migrateV1(JSON.parse(text)));
    db.settings.onboarded = true;
    return db;
  } catch {
    return null;
  }
}

/**
 * Saves `next` only if the stored revision still equals `next.revision`.
 * Returns the saved DB with its revision incremented.
 */
export async function save(next: DB): Promise<DB> {
  const d = await idb();
  const tx = d.transaction(STORE, 'readwrite');
  const current = (await tx.store.get(KEY)) as DB | undefined;
  if (current && current.revision !== next.revision) {
    tx.abort();
    await tx.done.catch(() => undefined);
    throw new ConflictError();
  }
  const saved = { ...next, revision: next.revision + 1 };
  await tx.store.put(saved, KEY);
  await tx.done;
  channel()?.postMessage({ revision: saved.revision });
  return saved;
}

/** Replaces everything (used by import and reset). */
export async function replaceAll(db: DB): Promise<DB> {
  const d = await idb();
  const current = (await d.get(STORE, KEY)) as DB | undefined;
  const saved = { ...db, revision: (current?.revision ?? 0) + 1 };
  await d.put(STORE, saved, KEY);
  channel()?.postMessage({ revision: saved.revision });
  return saved;
}

let bc: BroadcastChannel | null | undefined;
function channel() {
  if (bc === undefined) bc = typeof BroadcastChannel === 'function' ? new BroadcastChannel('yawmi') : null;
  return bc;
}

/** Calls back when another tab saved a newer revision. */
export function onExternalChange(cb: (revision: number) => void): () => void {
  const c = channel();
  if (!c) return () => undefined;
  const h = (e: MessageEvent) => cb(Number(e.data?.revision));
  c.addEventListener('message', h);
  return () => c.removeEventListener('message', h);
}

export type PersistState = 'persisted' | 'best-effort' | 'unsupported';

/** Asks the browser not to evict our data. Never throws. */
export async function requestPersistence(): Promise<PersistState> {
  try {
    if (!navigator.storage?.persist) return 'unsupported';
    if (await navigator.storage.persisted()) return 'persisted';
    return (await navigator.storage.persist()) ? 'persisted' : 'best-effort';
  } catch {
    return 'unsupported';
  }
}
