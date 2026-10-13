// Bridges to the phone. Inside the iOS app (Capacitor) this uses Apple's speech
// recognition and local notifications. In a browser it falls back to the Web Speech
// API, and to typing when no recognizer exists. Nothing here touches app data.
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { LocalNotifications } from '@capacitor/local-notifications';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import { StatusBar, Style } from '@capacitor/status-bar';
import type { DB } from '../domain/model';

export const isNative = Capacitor.isNativePlatform();

// ---------- speech ----------

export type SpeechKind = 'native' | 'web' | 'none';

interface WebRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

function webRecognizer(): (new () => WebRecognition) | null {
  const w = globalThis as unknown as { SpeechRecognition?: new () => WebRecognition; webkitSpeechRecognition?: new () => WebRecognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export async function speechKind(): Promise<SpeechKind> {
  if (isNative) {
    try {
      return (await SpeechRecognition.available()).available ? 'native' : 'none';
    } catch {
      return 'none';
    }
  }
  return webRecognizer() ? 'web' : 'none';
}

/** Egyptian Arabic first, then any Arabic the device supports. */
async function pickLanguage(): Promise<string> {
  try {
    const { languages } = await SpeechRecognition.getSupportedLanguages();
    const list = (languages as string[]).map((l) => String(l).replace('_', '-'));
    return ['ar-EG', 'ar-SA', 'ar-AE', 'ar'].find((l) => list.includes(l)) ?? list.find((l) => l.startsWith('ar')) ?? 'ar-EG';
  } catch {
    return 'ar-EG';
  }
}

export interface Listening {
  stop: () => Promise<string>;
  cancel: () => void;
}

export class SpeechError extends Error {}

/**
 * Starts listening. `onText` receives the live transcript.
 * `stop()` resolves with the final text.
 */
export async function listen(onText: (text: string) => void, onEnd: (error?: string) => void): Promise<Listening> {
  if (isNative) {
    const perm = await SpeechRecognition.requestPermissions();
    if (perm.speechRecognition !== 'granted')
      throw new SpeechError('محتاجين إذن المايك والتعرّف على الكلام. فعّليه من الإعدادات، أو اكتبي بدل الكلام.');
    let latest = '';
    await SpeechRecognition.removeAllListeners();
    await SpeechRecognition.addListener('partialResults', ({ matches }) => {
      if (matches?.[0]) { latest = matches[0]; onText(latest); }
    });
    await SpeechRecognition.addListener('listeningState', ({ status }) => { if (status === 'stopped') onEnd(); });
    const language = await pickLanguage();
    void SpeechRecognition.start({ language, partialResults: true, popup: false, maxResults: 1 }).catch(() => onEnd());
    return {
      stop: async () => { await SpeechRecognition.stop().catch(() => undefined); await SpeechRecognition.removeAllListeners(); return latest; },
      cancel: () => { void SpeechRecognition.stop().catch(() => undefined); void SpeechRecognition.removeAllListeners(); }
    };
  }

  const Ctor = webRecognizer();
  if (!Ctor) throw new SpeechError('الجهاز ده مش بيدعم الكلام. اكتبي، أو دوسي على مايك الكيبورد.');
  const rec = new Ctor();
  rec.lang = 'ar-EG';
  rec.continuous = true;
  rec.interimResults = true;
  let finalText = '';
  let interim = '';
  let ended = false;
  const text = () => `${finalText}${interim}`.trim();
  rec.onresult = (e) => {
    interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText += `${r[0].transcript} `;
      else interim += r[0].transcript;
    }
    onText(`${finalText}${interim}`.trim());
  };
  rec.onerror = (e) => {
    ended = true;
    onEnd(e.error === 'not-allowed' || e.error === 'service-not-allowed'
      ? 'المايك مقفول للتطبيق ده. فعّليه من إعدادات المتصفح، أو اكتبي.'
      : e.error === 'no-speech' ? 'ما سمعناش كلام. جربي تاني أو اكتبي.' : undefined);
  };
  rec.onend = () => { ended = true; onEnd(); };
  rec.start();
  return {
    stop: () => new Promise((resolve) => {
      if (ended) return resolve(text());
      const timer = setTimeout(() => resolve(text()), 1500);
      rec.onend = () => { ended = true; clearTimeout(timer); onEnd(); resolve(text()); };
      try { rec.stop(); } catch { clearTimeout(timer); resolve(text()); }
    }),
    cancel: () => { try { rec.abort(); } catch { /* already stopped */ } }
  };
}

// ---------- wait alarms (native only) ----------

/** Stable 31-bit id per wait instance. */
function alarmId(taskId: string, end: number): number {
  let h = 2166136261;
  for (const c of `${taskId}:${end}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return Math.abs(h) % 2_000_000_000 || 1;
}

let permissionAsked = false;

/** Makes the scheduled alarms match the running waits: adds new ones, removes stale ones. */
export async function syncWaitAlarms(db: DB, now = Date.now()): Promise<void> {
  if (!isNative) return;
  try {
    const wanted = new Map<number, { title: string; at: number }>();
    for (const w of db.waits) {
      if (w.end <= now) continue;
      const t = db.tasks.find((x) => x.id === w.taskId);
      wanted.set(alarmId(w.taskId, w.end), { title: t?.title ?? '', at: w.end });
    }
    const { notifications: pending } = await LocalNotifications.getPending();
    const stale = pending.filter((p) => !wanted.has(p.id));
    if (stale.length) await LocalNotifications.cancel({ notifications: stale.map((p) => ({ id: p.id })) });
    const have = new Set(pending.map((p) => p.id));
    const toAdd = [...wanted].filter(([id]) => !have.has(id));
    if (!toAdd.length) return;
    let perm = await LocalNotifications.checkPermissions();
    if (perm.display !== 'granted' && !permissionAsked) {
      permissionAsked = true;
      perm = await LocalNotifications.requestPermissions();
    }
    if (perm.display !== 'granted') return;
    await LocalNotifications.schedule({
      notifications: toAdd.map(([id, n]) => ({
        id,
        title: 'يومي',
        body: n.title ? `${n.title}: الانتظار خلص غالبًا` : 'الانتظار خلص غالبًا',
        schedule: { at: new Date(n.at), allowWhileIdle: true },
        sound: undefined
      }))
    });
  } catch {
    // Alarms are a convenience; the in-app countdown still works.
  }
}

/** Whether the phone will alert her when a wait ends, even with the app closed. */
export async function alarmStatus(): Promise<'granted' | 'denied' | 'ask' | 'web'> {
  if (!isNative) return 'web';
  try {
    const p = await LocalNotifications.checkPermissions();
    return p.display === 'granted' ? 'granted' : p.display === 'denied' ? 'denied' : 'ask';
  } catch {
    return 'denied';
  }
}

// ---------- feel ----------

export function tap(): void {
  if (isNative) void Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
  else navigator.vibrate?.(10);
}

/** Native chrome: status bar style and the Android-style back gesture closing sheets. */
export function setupNativeShell(): void {
  if (!isNative) return;
  void StatusBar.setStyle({ style: Style.Light }).catch(() => undefined);
  void App.addListener('backButton', () => {
    const open = document.querySelector<HTMLDialogElement>('dialog[open]');
    if (open) open.dispatchEvent(new Event('cancel'));
    else void App.minimizeApp();
  });
}
