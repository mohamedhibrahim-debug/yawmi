import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { DB } from '../domain/model';
import { DomainError, materialize } from '../domain/ops';
import { todayKey } from '../domain/time';
import { ConflictError, load, onExternalChange, replaceAll, requestPersistence, save, type PersistState } from '../storage/store';

export interface Store {
  db: DB | null;
  error: string | null;
  persist: PersistState | null;
  /** Applies a change to a copy of the DB and saves it atomically. Returns false on failure. */
  mutate: (fn: (draft: DB) => void, okMessage?: string) => Promise<boolean>;
  replace: (db: DB) => Promise<void>;
  toast: string | null;
  showToast: (msg: string) => void;
}

export function useStore(): Store {
  const [db, setDb] = useState<DB | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [persist, setPersist] = useState<PersistState | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const dbRef = useRef<DB | null>(null);
  dbRef.current = db;
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const toastTimer = useRef<number>();

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3200);
  }, []);

  const reload = useCallback(async () => {
    const { db: loaded } = await load();
    setDb(loaded);
  }, []);

  useEffect(() => {
    load()
      .then(async ({ db: loaded, source }) => {
        // Today's routine tasks are written as soon as the app opens.
        const draft = structuredClone(loaded);
        if (materialize(draft, todayKey(draft.settings.zone))) {
          setDb(await save(draft));
        } else setDb(loaded);
        if (source === 'legacy') showToast('نقلنا بياناتك من النسخة التجريبية');
        if (source === 'recovered') setError('كان فيه مشكلة في قراءة بياناتك، فبدأنا من جديد واحتفظنا بالنسخة القديمة جوه الجهاز.');
      })
      .catch(() => setError('المتصفح ده مش سامح بحفظ البيانات. جربي تفتحي يومي برا وضع التصفح الخفي.'));
    requestPersistence().then(setPersist);
    return onExternalChange((rev) => {
      if (!dbRef.current || rev > dbRef.current.revision) void reload();
    });
  }, [reload, showToast]);

  const mutate = useCallback(
    (fn: (draft: DB) => void, okMessage?: string) => {
      // Serialize writes from this tab so each one starts from the last saved revision.
      const run = queue.current.then(async () => {
        const current = dbRef.current;
        if (!current) return false;
        const draft = structuredClone(current);
        try {
          fn(draft);
        } catch (e) {
          showToast(e instanceof DomainError ? e.message : 'حصلت مشكلة، جربي تاني');
          return false;
        }
        try {
          const saved = await save(draft);
          dbRef.current = saved;
          setDb(saved);
          if (okMessage) showToast(okMessage);
          return true;
        } catch (e) {
          if (e instanceof ConflictError) {
            showToast(e.message);
            await reload();
          } else if (e instanceof DOMException && e.name === 'QuotaExceededError') {
            showToast('مساحة التخزين على الجهاز خلصت. التعديل ما اتحفظش.');
          } else {
            showToast('ما قدرناش نحفظ التعديل. جربي تاني.');
          }
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

/** Re-renders every `ms` while `active` is true (timers, countdowns, day rollover). */
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
