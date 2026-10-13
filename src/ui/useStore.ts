import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { DB } from '../domain/model';
import { DomainError, materialize } from '../domain/ops';
import { todayKey } from '../domain/time';
import { t } from '../i18n';
import { ConflictError, load, onExternalChange, replaceAll, requestPersistence, save, type PersistState } from '../storage/store';

export interface Toast { text: string; undo?: () => void }

export interface Store {
  db: DB | null;
  error: string | null;
  persist: PersistState | null;
  /** Applies a change to a copy of the DB and saves it atomically. Returns false on failure. */
  mutate: (fn: (draft: DB) => void, ok?: string | Toast) => Promise<boolean>;
  replace: (db: DB) => Promise<void>;
  toast: Toast | null;
  showToast: (t: string | Toast) => void;
}

export function useStore(): Store {
  const [db, setDb] = useState<DB | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [persist, setPersist] = useState<PersistState | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const dbRef = useRef<DB | null>(null);
  dbRef.current = db;
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const toastTimer = useRef<number>();

  const showToast = useCallback((msg: string | Toast) => {
    const tt = typeof msg === 'string' ? { text: msg } : msg;
    setToast(tt);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), tt.undo ? 5000 : 2600);
  }, []);

  const reload = useCallback(async () => {
    setDb((await load()).db);
  }, []);

  useEffect(() => {
    load()
      .then(async ({ db: loaded, source }) => {
        const draft = structuredClone(loaded);
        if (materialize(draft, todayKey(draft.settings.zone))) setDb(await save(draft));
        else setDb(loaded);
        if (source === 'recovered') setError('saveFailed');
      })
      .catch(() => setError('storageBlocked'));
    requestPersistence().then(setPersist);
    return onExternalChange((rev) => {
      if (!dbRef.current || rev > dbRef.current.revision) void reload();
    });
  }, [reload]);

  const mutate = useCallback(
    (fn: (draft: DB) => void, ok?: string | Toast) => {
      // Serialize writes from this tab so each starts from the last saved revision.
      const run = queue.current.then(async () => {
        const current = dbRef.current;
        if (!current) return false;
        const draft = structuredClone(current);
        try {
          fn(draft);
        } catch (e) {
          showToast(e instanceof DomainError ? t(e.code, e.params) : t('saveFailed'));
          return false;
        }
        try {
          const saved = await save(draft);
          dbRef.current = saved;
          setDb(saved);
          if (ok) showToast(ok);
          return true;
        } catch (e) {
          if (e instanceof ConflictError) {
            showToast(t('conflict'));
            await reload();
          } else if (e instanceof DOMException && e.name === 'QuotaExceededError') showToast(t('storageFull'));
          else showToast(t('saveFailed'));
          return false;
        }
      });
      queue.current = run.catch(() => undefined);
      return run;
    },
    [reload, showToast]
  );

  const replace = useCallback(async (next: DB) => {
    const saved = await replaceAll(next);
    dbRef.current = saved;
    setDb(saved);
  }, []);

  return { db, error, persist, mutate, replace, toast, showToast };
}

/** Re-renders every `ms` (timers, countdowns, day rollover) and when the app comes back to the front. */
export function useNow(ms: number): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms);
    const vis = () => setNow(Date.now());
    document.addEventListener('visibilitychange', vis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', vis);
    };
  }, [ms]);
  return now;
}
