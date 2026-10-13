import { useEffect, useRef, useState } from 'preact/hooks';
import { useRegisterSW } from 'virtual:pwa-register/preact';
import { LIMITS, type DB } from '../domain/model';
import { addTask, DomainError, materialize } from '../domain/ops';
import { isDayKey, isValidZone, todayKey, type DayKey } from '../domain/time';
import { isNative, setupNativeShell, syncWaitAlarms, tap } from '../platform/native';
import { longDate, n } from './format';
import { Onboarding, SettingsModal } from './Modals';
import { HistoryView, RoutinesView, TodayView } from './Views';
import { VoiceSheet, type ReadyTask } from './Voice';
import { useNow, useStore } from './useStore';

type Route = 'today' | 'routines' | 'history';

function readRoute(): Route {
  const h = location.hash.replace('#', '');
  return h === 'routines' || h === 'history' ? h : 'today';
}

const ICONS = {
  today: <path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 2a7 7 0 1 1 0 14 7 7 0 0 1 0-14Zm-1 3v4.4l3.3 2 1-1.6-2.3-1.4V8h-2Z" />,
  routines: <path d="M12 4a8 8 0 0 0-7.4 5H2l3.5 4L9 9H6.8A6 6 0 1 1 6 12H4a8 8 0 1 0 8-8Z" />,
  history: <path d="M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm1 2v14h10V5H7Zm2 2h6v2H9V7Zm0 4h6v2H9v-2Zm0 4h4v2H9v-2Z" />,
  mic: <path d="M12 15a3.5 3.5 0 0 0 3.5-3.5v-6a3.5 3.5 0 1 0-7 0v6A3.5 3.5 0 0 0 12 15Zm6-3.5a1 1 0 1 0-2 0 4 4 0 0 1-8 0 1 1 0 1 0-2 0 6 6 0 0 0 5 5.9V20H8.5a1 1 0 1 0 0 2h7a1 1 0 1 0 0-2H13v-2.6a6 6 0 0 0 5-5.9Z" />,
  settings: <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm8.4 4.6.1-1.1-.1-1.1 2-1.6-2-3.4-2.4 1a8 8 0 0 0-1.9-1.1L15.7 3h-4l-.4 2.5a8 8 0 0 0-1.9 1.1L7 5.6 5 9l2 1.6-.1 1.4.1 1.1-2 1.6 2 3.4 2.4-1c.6.5 1.2.8 1.9 1.1l.4 2.6h4l.4-2.6c.7-.3 1.3-.6 1.9-1.1l2.4 1 2-3.4-2-1.5Z" />
};
const Icon = (p: { name: keyof typeof ICONS }) => <svg viewBox="0 0 24 24" aria-hidden="true" class="ico"><g fill="currentColor">{ICONS[p.name]}</g></svg>;

export function App() {
  const store = useStore();
  const { db, mutate, toast, showToast } = store;
  const [route, setRoute] = useState<Route>(readRoute);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [voice, setVoice] = useState<null | { typing: boolean }>(null);
  const [date, setDate] = useState<DayKey | null>(null);
  const hasTimers = !!db && (!!db.active || db.waits.length > 0);
  const now = useNow(hasTimers ? 1000 : 30_000);
  const today = db ? todayKey(db.settings.zone, now) : null;
  const alerted = useRef(new Set<string>());

  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({
    // Look for a new version every hour while the app stays open (web build only).
    onRegisteredSW(_url, reg) {
      if (reg) setInterval(() => void reg.update().catch(() => undefined), 60 * 60_000);
    }
  });

  useEffect(() => {
    setupNativeShell();
    const h = () => setRoute(readRoute());
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);

  // Follow "today" across midnight unless the user picked another day.
  const lastToday = useRef<DayKey | null>(null);
  useEffect(() => {
    if (!today) return;
    if (date === null || date === lastToday.current) setDate(today);
    lastToday.current = today;
  }, [today]);

  // Opening a past or current day writes its routine tasks (future days only preview them).
  useEffect(() => {
    if (!db || !date || !today || date > today) return;
    const probe = structuredClone(db);
    if (materialize(probe, date)) void mutate((d) => void materialize(d, date));
  }, [date, today, db?.routines]);

  // Phone alarms for running waits, so she's told even with the app closed.
  useEffect(() => {
    if (db) void syncWaitAlarms(db);
  }, [db?.waits, db?.tasks]);

  // In-app alert when a wait finishes while the app is open.
  useEffect(() => {
    if (!db) return;
    for (const w of db.waits) {
      const key = `${w.taskId}:${w.end}`;
      if (w.end <= now && !alerted.current.has(key)) {
        alerted.current.add(key);
        const t = db.tasks.find((x) => x.id === w.taskId);
        showToast(`الانتظار خلص: ${t?.title ?? ''}`);
        tap();
        if (!isNative && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          navigator.serviceWorker?.ready
            .then((r) => r.showNotification('يومي', { body: `الانتظار خلص: ${t?.title ?? ''}`, tag: key, lang: 'ar', dir: 'rtl', icon: '/icon-192.png' }))
            .catch(() => undefined);
        }
      }
    }
  }, [now, db?.waits]);

  const go = (r: Route) => {
    tap();
    location.hash = r;
    setRoute(r);
  };

  const saveSettings = (s: Partial<DB['settings']>) =>
    mutate((d) => {
      const next = { ...d.settings, ...s, onboarded: true };
      if (!Number.isInteger(next.capacity) || next.capacity < LIMITS.capacityMin || next.capacity > LIMITS.capacityMax)
        throw new DomainError(`الوقت المتاح لازم يكون من ${LIMITS.capacityMin} لـ ${LIMITS.capacityMax} دقيقة`);
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(next.start)) throw new DomainError('وقت البداية مش صحيح');
      if (!isValidZone(next.zone)) throw new DomainError('المنطقة الزمنية مش صحيحة');
      if (next.name.length > LIMITS.name) throw new DomainError('الاسم طويل');
      d.settings = next;
    }, 'اتحفظت الإعدادات');

  const addFromVoice = (tasks: ReadyTask[]) =>
    mutate((d) => {
      for (const { date: day, ...fields } of tasks) addTask(d, fields, day);
    }, tasks.length === 1 ? 'اتضافت' : `اتضافت ${n(tasks.length)} حاجات`);

  if (store.error && !db) return <div class="fatal" role="alert"><h1>يومي</h1><p>{store.error}</p></div>;
  if (!db || !date || !today) return <div class="loading" aria-busy="true">يومي…</div>;

  return (
    <div class="app-shell">
      <a class="skip" href="#main">انتقلي للمحتوى</a>
      <header class="topbar">
        <a class="brand" href="#today" aria-label="يومي، الصفحة الرئيسية"><span class="brand-mark">ي</span><span>يومي</span></a>
        <span class="date-label">{longDate(today)}</span>
      </header>

      {store.error && <div class="note warn" role="alert">{store.error}</div>}
      {needRefresh && (
        <div class="note" role="status">
          فيه نسخة أحدث من يومي. <button class="link" onClick={() => updateServiceWorker(true)}>حدّثي دلوقتي</button>
        </div>
      )}

      <main id="main" class="workspace">
        {route === 'today' && (
          <TodayView db={db} mutate={mutate} date={date} setDate={(d) => isDayKey(d) && setDate(d)} now={now} showToast={showToast}
            onVoice={(typing) => setVoice({ typing })} />
        )}
        {route === 'routines' && <RoutinesView db={db} mutate={mutate} now={now} />}
        {route === 'history' && <HistoryView db={db} mutate={mutate} date={date} setDate={(d) => isDayKey(d) && setDate(d)} now={now} />}
      </main>

      <nav class="bottom-nav" aria-label="القائمة">
        <button class={route === 'today' ? 'active' : ''} aria-current={route === 'today' ? 'page' : undefined} onClick={() => go('today')}>
          <Icon name="today" />اليوم
        </button>
        <button class={route === 'routines' ? 'active' : ''} aria-current={route === 'routines' ? 'page' : undefined} onClick={() => go('routines')}>
          <Icon name="routines" />روتيني
        </button>
        <button class="mic-tab" aria-label="قولي اللي وراكي بالصوت" onClick={() => { tap(); setVoice({ typing: false }); }}>
          <span class="mic-bubble"><Icon name="mic" /></span>قولي
        </button>
        <button class={route === 'history' ? 'active' : ''} aria-current={route === 'history' ? 'page' : undefined} onClick={() => go('history')}>
          <Icon name="history" />سجلّي
        </button>
        <button onClick={() => { tap(); setSettingsOpen(true); }}>
          <Icon name="settings" />الإعدادات
        </button>
      </nav>

      {!db.settings.onboarded && (
        // Closing with × also counts as onboarded, keeping the defaults.
        <Onboarding db={db} onSave={saveSettings} onClose={() => void mutate((d) => { d.settings.onboarded = true; })} />
      )}
      {settingsOpen && (
        <SettingsModal db={db} persist={store.persist} onSave={saveSettings} onClose={() => setSettingsOpen(false)}
          onImport={async (next) => {
            await store.replace(next);
            showToast('اترجعت بياناتك');
          }} />
      )}
      {voice && <VoiceSheet today={today} startTyping={voice.typing} onAdd={addFromVoice} onClose={() => setVoice(null)} />}
      {toast && <div class="toast" role="status" aria-live="polite">{toast}</div>}
    </div>
  );
}
