import { useEffect, useRef, useState } from 'preact/hooks';
import { useRegisterSW } from 'virtual:pwa-register/preact';
import type { DB, Task, TaskFields } from '../domain/model';
import { addTask, beginWait, bringForward, cancelWait, materialize, move, remove, start, stop, toggleDone, updateTask } from '../domain/ops';
import { addDays, isDayKey, todayKey, type DayKey } from '../domain/time';
import { dur, resolveLocale, setLocale, t, templates } from '../i18n';
import { isNative, setupNativeShell, syncWaitAlarms, tap } from '../platform/native';
import { AddSheet, type ReadyTask } from './AddSheet';
import { Icon } from './kit';
import { HistoryView, RoutinesView, SettingsSheet, WelcomeSheet } from './Screens';
import { TaskSheet } from './TaskSheet';
import { NowStrip, TodayView, type RowActions } from './Today';
import { useNow, useStore } from './useStore';
import { LoginSheet, whenLabel } from './Account';
import type { Account, CloudBackup } from '../platform/cloud';

// Supabase loads lazily: only after a sign-in, or when a saved session exists.
const cloud = () => import('../platform/cloud');
const hasSavedSession = () => { try { return !!localStorage.getItem('yawmi-auth'); } catch { return false; } };
const linkInUrl = () => /access_token=|refresh_token=|error_description=/.test(location.hash) || /[?&]code=/.test(location.search);
import { Sheet } from './kit';

type Tab = 'today' | 'routines' | 'history';
const readTab = (): Tab => {
  const h = location.hash.slice(1);
  return h === 'routines' || h === 'history' ? h : 'today';
};

type Open =
  | { kind: 'add'; listen: boolean }
  | { kind: 'task'; id: string }
  | { kind: 'new'; initial: Partial<TaskFields> }
  | { kind: 'settings' }
  | { kind: 'login' }
  | null;

const LAST_BACKUP_KEY = 'yawmi-last-backup';
const readLast = () => { try { return localStorage.getItem(LAST_BACKUP_KEY); } catch { return null; } };

export function App() {
  const store = useStore();
  const { db, mutate, showToast } = store;
  if (db) setLocale(resolveLocale(db.settings.language));
  const [tab, setTab] = useState<Tab>(readTab);
  const [open, setOpen] = useState<Open>(null);
  const [date, setDate] = useState<DayKey | null>(null);
  const hasTimers = !!db && (!!db.active || db.waits.length > 0);
  const now = useNow(hasTimers ? 1000 : 30_000);
  const today = db ? todayKey(db.settings.zone, now) : null;
  const alerted = useRef(new Set<string>());
  const [account, setAccount] = useState<Account | null>(null);
  const [lastBackup, setLastBackup] = useState<string | null>(readLast);
  const [cloudBusy, setCloudBusy] = useState(false);
  const [restoreOffer, setRestoreOffer] = useState<CloudBackup | null>(null);
  const backupTimer = useRef<number>();

  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_u, reg) { if (reg) setInterval(() => void reg.update().catch(() => undefined), 60 * 60_000); }
  });

  // Account: restore the session, follow sign-in/out.
  useEffect(() => {
    const fromLink = linkInUrl();
    if (!hasSavedSession() && !fromLink) return;
    let off = () => undefined as void;
    void cloud().then(async (c) => {
      off = c.onAccountChange(setAccount);
      if (fromLink) {
        const { account: a, error } = await c.finishLinkSignIn();
        if (a) void afterSignIn(a);
        else if (error) showToast(t(error));
      } else setAccount(await c.currentAccount());
    });
    return () => off();
  }, []);

  const backup = async (silent: boolean) => {
    if (!account || !store.db) return;
    try {
      const at = await (await cloud()).pushBackup(store.db);
      setLastBackup(at);
      try { localStorage.setItem(LAST_BACKUP_KEY, at); } catch { /* optional */ }
      if (!silent) showToast(t('backedUp'));
    } catch (e) {
      if (!silent) showToast(t(e instanceof Error ? e.message : 'saveFailed'));
    }
  };

  // Automatic cloud backup a few seconds after each change, when signed in.
  useEffect(() => {
    if (!account || !db) return;
    window.clearTimeout(backupTimer.current);
    backupTimer.current = window.setTimeout(() => void backup(true), 4000);
    return () => window.clearTimeout(backupTimer.current);
  }, [account?.id, db?.revision]);

  /** After signing in: an empty phone restores the cloud copy; otherwise ask. */
  const afterSignIn = async (a: Account) => {
    setAccount(a);
    setOpen(null);
    showToast(t('welcomeBack'));
    try {
      const remote = await (await cloud()).pullBackup();
      const local = store.db;
      const localEmpty = !local || (local.tasks.length === 0 && local.routines.length === 0);
      if (remote && localEmpty) { await store.replace({ ...remote.db, settings: { ...remote.db.settings, onboarded: true } }); showToast(t('restored')); }
      else if (remote) setRestoreOffer(remote);
      else void backup(true);
    } catch { /* offline: backup will retry on next change */ }
  };

  useEffect(() => {
    setupNativeShell();
    const h = () => setTab(readTab());
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);

  // Follow "today" across midnight unless she picked another day.
  const lastToday = useRef<DayKey | null>(null);
  useEffect(() => {
    if (!today) return;
    if (date === null || date === lastToday.current) setDate(today);
    lastToday.current = today;
  }, [today]);

  // Opening a past or current day writes its routine tasks.
  useEffect(() => {
    if (!db || !date || !today || date > today) return;
    if (materialize(structuredClone(db), date)) void mutate((d) => void materialize(d, date));
  }, [date, today, db?.routines]);

  // Phone alarms for running waits (native app), and an in-app alert when one ends.
  useEffect(() => { if (db) void syncWaitAlarms(db); }, [db?.waits, db?.tasks, db?.settings.language]);
  useEffect(() => {
    if (!db) return;
    for (const w of db.waits) {
      const key = `${w.taskId}:${w.end}`;
      if (w.end <= now && !alerted.current.has(key)) {
        alerted.current.add(key);
        const title = db.tasks.find((x) => x.id === w.taskId)?.title ?? '';
        showToast(t('waitDoneOf', { title }));
        tap();
        if (!isNative && typeof Notification !== 'undefined' && Notification.permission === 'granted')
          navigator.serviceWorker?.ready.then((r) => r.showNotification(t('appName'), { body: t('waitDoneOf', { title }), tag: key })).catch(() => undefined);
      }
    }
  }, [now, db?.waits]);

  if (store.error && !db) return <div class="fatal" role="alert"><img src={`${import.meta.env.BASE_URL}logo.svg`} alt="" /><p>{t(store.error)}</p></div>;
  if (!db || !date || !today) return <div class="splash" aria-busy="true"><img src={`${import.meta.env.BASE_URL}logo.svg`} alt="Yawmi" /></div>;

  const go = (next: Tab) => { tap(); location.hash = next; setTab(next); };

  /** Saves a change with an undo that restores the exact previous data. */
  const withUndo = async (fn: (d: DB) => void, text: string) => {
    const before = structuredClone(db);
    await mutate(fn, { text, undo: () => void store.replace(before).then(() => showToast(t('undo'))) });
  };

  const actions: RowActions = {
    open: (task) => setOpen({ kind: 'task', id: task.id }),
    toggle: (task) => {
      const wasTodo = task.status === 'todo';
      const startsWait = wasTodo && task.wait > 0 && !db.waits.some((w) => w.taskId === task.id);
      void withUndo((d) => void toggleDone(d, task.id), wasTodo ? (startsWait ? t('doneWaitToast', { t: dur(task.wait) }) : t('doneToast')) : t('saved'));
    },
    start: (task) => void mutate((d) => start(d, task.id)),
    tomorrow: (task) => void withUndo((d) => move(d, task.id, addDays(task.date < today ? today : task.date, 1)), t('movedTomorrow'))
  };

  const addReady = (tasks: ReadyTask[]) =>
    mutate((d) => { for (const { date: day, ...f } of tasks) addTask(d, f, day); }, tasks.length === 1 ? t('addedOne') : t('addedMany', { n: tasks.length }));

  const openTask = open?.kind === 'task' ? db.tasks.find((x) => x.id === open.id) : undefined;

  // FAB: tap opens add; press and hold starts listening right away.
  let holdTimer = 0;
  let held = false;
  const fabDown = () => { held = false; holdTimer = window.setTimeout(() => { held = true; tap(); setOpen({ kind: 'add', listen: true }); }, 450); };
  const fabUp = () => { window.clearTimeout(holdTimer); };
  const fabClick = () => { if (!held) { tap(); setOpen({ kind: 'add', listen: false }); } };

  return (
    <div class="app">
      {needRefresh && <div class="banner" role="status">{t('update')} <button class="text-btn strong" onClick={() => updateServiceWorker(true)}>{t('updateNow')}</button></div>}
      {store.error && <div class="banner warn" role="alert">{t(store.error)}</div>}

      <main class="content">
        {tab === 'today' && (
          <TodayView db={db} today={today} date={date} setDate={(d) => isDayKey(d) && setDate(d)} now={now} actions={actions}
            mutate={mutate} onSettings={() => setOpen({ kind: 'settings' })}
            onAddTemplate={(i) => { const { emoji: _e, ...tpl } = templates()[i]; void _e; setOpen({ kind: 'new', initial: tpl }); }}
            onBringForward={(ids) => void withUndo((d) => bringForward(d, ids, today), t('saved'))} />
        )}
        {tab === 'routines' && <RoutinesView db={db} today={today} mutate={mutate} />}
        {tab === 'history' && <HistoryView db={db} today={today} date={date} setDate={(d) => isDayKey(d) && setDate(d)} now={now} mutate={mutate} />}
      </main>

      <div class="dock">
        <NowStrip db={db} now={now} onOpen={(task: Task) => setOpen({ kind: 'task', id: task.id })} onStop={() => void mutate((d) => stop(d))} />
        {tab === 'today' && (
          <button class="fab" aria-label={t('add')} onPointerDown={fabDown} onPointerUp={fabUp} onPointerLeave={fabUp} onClick={fabClick}
            onContextMenu={(e) => e.preventDefault()}>
            <Icon name="plus" size={30} />
          </button>
        )}
        <nav class="tabbar" aria-label={t('appName')}>
          {([['today', 'today', 'tabToday'], ['routines', 'routines', 'tabRoutines'], ['history', 'history', 'tabHistory']] as const).map(([id, icon, label]) => (
            <button class={tab === id ? 'on' : ''} aria-current={tab === id ? 'page' : undefined} onClick={() => go(id)}>
              <Icon name={icon} /><span>{t(label)}</span>
            </button>
          ))}
        </nav>
      </div>

      {store.toast && (
        <div class="toast" role="status" aria-live="polite">
          <span>{store.toast.text}</span>
          {store.toast.undo && <button class="text-btn strong" onClick={() => { store.toast!.undo!(); }}>{t('undo')}</button>}
        </div>
      )}

      {!db.settings.onboarded && <WelcomeSheet db={db} onSignIn={() => setOpen({ kind: 'login' })} onDone={(patch) => void mutate((d) => { d.settings = { ...d.settings, ...patch, onboarded: true }; })} />}
      {open?.kind === 'login' && <LoginSheet onClose={() => setOpen(null)} onDone={(a) => void afterSignIn(a)} />}
      {restoreOffer && (
        <Sheet title={t('restoreCloud')} onClose={() => setRestoreOffer(null)} leading={<span />}>
          <p>{t('cloudRestoreAsk', { when: whenLabel(restoreOffer.updatedAt) })}</p>
          <button class="btn primary wide" onClick={async () => { await store.replace({ ...restoreOffer.db, settings: { ...restoreOffer.db.settings, onboarded: true } }); setRestoreOffer(null); showToast(t('restored')); }}>{t('restoreYes')}</button>
          <button class="text-btn" onClick={() => { setRestoreOffer(null); void backup(true); }}>{t('restoreNo')}</button>
        </Sheet>
      )}

      {open?.kind === 'add' && (
        <AddSheet today={today} listenNow={open.listen} onAdd={addReady} onClose={() => setOpen(null)}
          onDetails={(title) => setOpen({ kind: 'new', initial: { title } })} />
      )}
      {open?.kind === 'new' && (
        <TaskSheet db={db} today={today} date={date < today ? today : date} initial={open.initial} now={now} onClose={() => setOpen(null)}
          onSave={(f, day) => mutate((d) => void addTask(d, f, day), t('addedOne'))} />
      )}
      {openTask && (
        <TaskSheet db={db} today={today} date={openTask.date} task={openTask} now={now} onClose={() => setOpen(null)}
          onSave={(f, day) => mutate((d) => { updateTask(d, openTask.id, f); if (day !== openTask.date) move(d, openTask.id, day); }, t('saved'))}
          actions={{
            start: () => void mutate((d) => start(d, openTask.id)),
            stop: () => void mutate((d) => stop(d)),
            beginWait: () => void mutate((d) => beginWait(d, openTask.id)),
            cancelWait: () => void mutate((d) => cancelWait(d, openTask.id)),
            tomorrow: () => { actions.tomorrow(openTask); setOpen(null); },
            remove: () => { void withUndo((d) => remove(d, openTask.id), t('deleted')); setOpen(null); }
          }} />
      )}
      {open?.kind === 'settings' && (
        <SettingsSheet db={db} persist={store.persist} mutate={mutate} showToast={showToast} onClose={() => setOpen(null)}
          cloud={{
            account, lastBackup, busy: cloudBusy,
            onSignIn: () => setOpen({ kind: 'login' }),
            onSignOut: () => { void cloud().then((c) => c.signOut()).then(() => { setAccount(null); showToast(t('signOut')); }); },
            onBackupNow: () => { setCloudBusy(true); void backup(false).finally(() => setCloudBusy(false)); },
            onRestoreCloud: () => { setCloudBusy(true); void cloud().then((c) => c.pullBackup()).then((c) => { if (c) setRestoreOffer(c); else showToast(t('neverBackedUp')); }).catch(() => showToast(t('offline'))).finally(() => setCloudBusy(false)); }
          }}
          onRestore={async (next) => { await store.replace(next); showToast(t('restored')); }} />
      )}
    </div>
  );
}
