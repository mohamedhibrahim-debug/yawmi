import { useEffect, useRef, useState } from 'preact/hooks';
import { CATEGORIES, PERIODS, PERIOD_ORDER, type Category, type Period } from '../domain/model';
import { dayOffset, parseSpeech, type Draft } from '../domain/voice';
import { addDays, weekday, type DayKey } from '../domain/time';
import { listen, speechKind, SpeechError, tap, type Listening, type SpeechKind } from '../platform/native';
import { minutesLabel, n, weekdayName } from './format';
import { Modal } from './Modals';

export interface ReadyTask {
  title: string; effort: number; wait: number; period: Period; category: Category; priority: boolean; date: DayKey;
}

interface Card extends Draft { key: number; offset: number }

const EFFORTS = [5, 10, 15, 20, 30, 45, 60, 90, 120];
const WAITS = [0, 15, 30, 40, 50, 60, 90, 120];
const CATS = Object.keys(CATEGORIES) as Category[];
const next = <T,>(list: T[], v: T): T => list[(list.indexOf(v) + 1) % list.length] ?? list[0];
const nextNum = (list: number[], v: number) => list.find((x) => x > v) ?? list[0];

export function VoiceSheet(props: { today: DayKey; onAdd: (tasks: ReadyTask[]) => Promise<boolean>; onClose: () => void; startTyping?: boolean }) {
  const [kind, setKind] = useState<SpeechKind | null>(null);
  const [mode, setMode] = useState<'listen' | 'review'>('listen');
  const [listening, setListening] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [busy, setBusy] = useState(false);
  const session = useRef<Listening | null>(null);
  const keySeq = useRef(0);
  const todayWd = weekday(props.today);

  useEffect(() => {
    void speechKind().then((k) => {
      setKind(k);
      if (k !== 'none' && !props.startTyping) void startListening();
    });
    return () => session.current?.cancel();
  }, []);

  const startListening = async () => {
    setError(null);
    try {
      tap();
      session.current = await listen(setText, (err) => {
        setListening(false);
        if (err) setError(err);
      });
      setListening(true);
    } catch (e) {
      setListening(false);
      setError(e instanceof SpeechError ? e.message : 'ما قدرناش نسمعك. جربي تاني أو اكتبي.');
    }
  };

  const finish = async () => {
    let said = text;
    if (session.current) {
      const heard = await session.current.stop();
      // If she typed or edited the box, her text wins over the recognizer's.
      said = text.trim() || heard;
      session.current = null;
      setListening(false);
    }
    analyse(said);
  };

  const analyse = (said: string) => {
    const drafts = parseSpeech(said);
    if (!drafts.length) {
      setError('ما لقيناش حاجات في الكلام ده. قولي مثلًا: «أشغل الغسالة وأطبخ الغدا بعد الضهر».');
      return;
    }
    setError(null);
    setCards((prev) => [...prev, ...drafts.map((d) => ({ ...d, key: keySeq.current++, offset: dayOffset(d.day, todayWd) }))]);
    setText('');
    setMode('review');
  };

  const update = (key: number, patch: Partial<Card>) =>
    setCards((cs) => cs.map((c) => (c.key === key ? { ...c, ...patch, guessed: { ...c.guessed, ...guessPatch(patch) } } : c)));

  const save = async () => {
    const ready = cards.filter((c) => c.title.trim()).map((c) => ({
      title: c.title.trim(), effort: c.effort, wait: c.wait, period: c.period, category: c.category, priority: c.priority,
      date: addDays(props.today, c.offset)
    }));
    if (!ready.length) return;
    setBusy(true);
    const ok = await props.onAdd(ready);
    setBusy(false);
    if (ok) props.onClose();
  };

  const dayLabel = (offset: number) => (offset === 0 ? 'النهارده' : offset === 1 ? 'بكرة' : weekdayName(addDays(props.today, offset)));

  if (mode === 'review') {
    return (
      <Modal title={`لقينا ${n(cards.length)} ${cards.length === 1 ? 'حاجة' : 'حاجات'}`} onClose={props.onClose} sheet>
        <p class="muted">راجعي بسرعة. دوسي على أي اختيار يتغيّر. اللي عليه «اقتراح» إحنا اللي خمّناه.</p>
        <ul class="drafts">
          {cards.map((c) => (
            <li class="draft" key={c.key}>
              <div class="draft-top">
                <input class="draft-title" value={c.title} aria-label="اسم الحاجة" maxLength={120}
                  onInput={(e) => update(c.key, { title: e.currentTarget.value })} />
                <button class="icon-button small-x" aria-label={`شيلي «${c.title}»`} onClick={() => setCards((cs) => cs.filter((x) => x.key !== c.key))}>×</button>
              </div>
              <div class="draft-chips">
                <Chip label={dayLabel(c.offset)} guessed={c.guessed.day} onTap={() => update(c.key, { offset: (c.offset + 1) % 7 })} />
                <Chip label={PERIODS[c.period]} guessed={c.guessed.period} onTap={() => update(c.key, { period: next(PERIOD_ORDER, c.period) })} />
                <Chip label={`◷ ${minutesLabel(c.effort)}`} guessed={c.guessed.effort} onTap={() => update(c.key, { effort: nextNum(EFFORTS, c.effort) })} />
                <Chip label={c.wait ? `⏳ ${minutesLabel(c.wait)} انتظار` : '⏳ من غير انتظار'} guessed={c.guessed.wait && c.wait > 0} onTap={() => update(c.key, { wait: nextNum(WAITS, c.wait) })} />
                <Chip label={CATEGORIES[c.category]} guessed={c.guessed.category} onTap={() => update(c.key, { category: next(CATS, c.category) })} />
                <Chip label={c.priority ? '★ مهمة' : '☆ عادية'} on={c.priority} onTap={() => update(c.key, { priority: !c.priority })} />
              </div>
            </li>
          ))}
        </ul>
        <div class="actions wrap">
          <button class="quiet" onClick={() => { setMode('listen'); if (kind !== 'none') void startListening(); }}>🎙 زوّدي حاجات</button>
          <span class="grow" />
          <button class="primary big-btn" disabled={busy || !cards.length} onClick={save}>ضيفي {n(cards.length)}</button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="قولي اللي وراكي" onClose={props.onClose} sheet>
      <div class="voice">
        {kind !== 'none' && (
          <button class={`mic${listening ? ' live' : ''}`} aria-pressed={listening}
            aria-label={listening ? 'خلصت كلام' : 'ابدئي الكلام'}
            onClick={() => (listening ? void finish() : void startListening())}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15a3.5 3.5 0 0 0 3.5-3.5v-6a3.5 3.5 0 1 0-7 0v6A3.5 3.5 0 0 0 12 15Zm6-3.5a1 1 0 1 0-2 0 4 4 0 0 1-8 0 1 1 0 1 0-2 0 6 6 0 0 0 5 5.9V20H8.5a1 1 0 1 0 0 2h7a1 1 0 1 0 0-2H13v-2.6a6 6 0 0 0 5-5.9Z" fill="currentColor" /></svg>
          </button>
        )}
        <p class="voice-state" aria-live="polite">
          {kind === null ? '…' : listening ? 'بسمعك… قولي كل اللي وراكي، وبعدين دوسي «خلصت».' : kind === 'none' ? 'اكتبي اللي وراكي، أو دوسي على مايك الكيبورد واتكلمي.' : 'دوسي على المايك واتكلمي.'}
        </p>
        <textarea class="transcript" rows={3} value={text} dir="rtl" placeholder="مثلًا: أشغل الغسالة وأطبخ الغدا بعد الضهر وأذاكر للولاد بالليل ساعة"
          aria-label="الكلام أو الكتابة" onInput={(e) => setText(e.currentTarget.value)} />
        {error && <p class="note warn" role="alert">{error}</p>}
        <div class="actions">
          <button class="quiet" onClick={props.onClose}>إلغاء</button>
          <span class="grow" />
          <button class="primary big-btn" disabled={!text.trim()} onClick={() => void finish()}>خلصت</button>
        </div>
        <p class="muted privacy">{kind === 'native' ? 'الكلام بيتحوّل لنص بخدمة أبل للتعرّف على الكلام.' : kind === 'web' ? 'الكلام بيتحوّل لنص بخدمة المتصفح.' : ''}</p>
      </div>
    </Modal>
  );
}

function guessPatch(patch: Partial<Card>) {
  const g: Partial<Draft['guessed']> = {};
  if ('offset' in patch) g.day = false;
  if ('period' in patch) g.period = false;
  if ('effort' in patch) g.effort = false;
  if ('wait' in patch) g.wait = false;
  if ('category' in patch) g.category = false;
  return g;
}

function Chip(props: { label: string; guessed?: boolean; on?: boolean; onTap: () => void }) {
  return (
    <button class={`vchip${props.guessed ? ' guessed' : ''}${props.on ? ' on' : ''}`} onClick={() => { tap(); props.onTap(); }}>
      {props.label}
      {props.guessed && <small>اقتراح</small>}
    </button>
  );
}
