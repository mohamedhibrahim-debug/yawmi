import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { PERIOD_ORDER, type Category, type Period, type TaskFields } from '../domain/model';
import { dayOffset, parseSpeech, type Draft } from '../domain/voice';
import { addDays, weekday, type DayKey } from '../domain/time';
import { CAT_ICON, catName, dur, locale, periodName, t, weekdayName } from '../i18n';
import { listen, speechKind, SpeechError, tap, type Listening, type SpeechKind } from '../platform/native';
import { Icon, Sheet } from './kit';

export interface ReadyTask extends TaskFields { date: DayKey }

interface Card extends Draft { key: number; offset: number }

const EFFORTS = [5, 10, 15, 20, 30, 45, 60, 90, 120];
const WAITS = [0, 15, 30, 45, 50, 60, 90, 120];
const CATS: Category[] = ['home', 'food', 'kids', 'self', 'other'];
const cycle = <T,>(list: T[], v: T): T => list[(list.indexOf(v) + 1) % list.length] ?? list[0];
const nextNum = (list: number[], v: number) => list.find((x) => x > v) ?? list[0];

/** The single add entry: type or talk; tasks appear as cards to confirm. */
export function AddSheet(props: {
  today: DayKey;
  listenNow: boolean;
  onAdd: (tasks: ReadyTask[]) => Promise<boolean>;
  onDetails: (title: string) => void;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<SpeechKind | null>(null);
  const [listening, setListening] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [edited, setEdited] = useState(false);
  const [busy, setBusy] = useState(false);
  const session = useRef<Listening | null>(null);
  const keySeq = useRef(0);
  const todayWd = weekday(props.today);
  const lang = locale();

  useEffect(() => {
    void speechKind().then((k) => {
      setKind(k);
      if (k !== 'none' && props.listenNow) void startListening();
    });
    return () => session.current?.cancel();
  }, []);

  // Live preview: re-parse while she talks or types, until she edits a card.
  const live = useMemo(() => parseSpeech(text, lang), [text, lang]);
  useEffect(() => {
    if (edited) return;
    setCards(live.map((d) => ({ ...d, key: keySeq.current++, offset: dayOffset(d.day, todayWd) })));
  }, [live]);

  const startListening = async () => {
    setError(null);
    try {
      tap();
      session.current = await listen((s) => { setEdited(false); setText(s); }, (err) => {
        setListening(false);
        if (err) setError(t(err));
      });
      setListening(true);
    } catch (e) {
      setListening(false);
      setError(t(e instanceof SpeechError ? e.message : 'voiceFailed'));
    }
  };

  const stopListening = async () => {
    if (!session.current) return;
    const heard = await session.current.stop();
    session.current = null;
    setListening(false);
    if (heard && !text.trim()) setText(heard);
  };

  const update = (key: number, patch: Partial<Card>, field: keyof Draft['guessed']) => {
    setEdited(true);
    setCards((cs) => cs.map((c) => (c.key === key ? { ...c, ...patch, guessed: { ...c.guessed, [field]: false } } : c)));
  };

  const save = async () => {
    if (listening) await stopListening();
    const ready = cards.filter((c) => c.title.trim()).map((c) => ({
      title: c.title.trim(), effort: c.effort, wait: c.wait, period: c.period, category: c.category, priority: c.priority, notes: '',
      date: addDays(props.today, c.offset)
    }));
    if (!ready.length) { setError(t('voiceNothing')); return; }
    setBusy(true);
    const ok = await props.onAdd(ready);
    setBusy(false);
    if (ok) props.onClose();
  };

  const dayLabel = (o: number) => (o === 0 ? t('today') : o === 1 ? t('tomorrow') : weekdayName(addDays(props.today, o)));

  return (
    <Sheet tall label={t('add')} onClose={props.onClose}
      trailing={<button class="text-btn strong" disabled={busy || !cards.length} onClick={() => void save()}>
        {cards.length > 1 ? t('voiceAddAll', { n: cards.length }) : t('add')}
      </button>}>
      <div class="composer">
        <textarea class="composer-input" rows={2} value={text} autoFocus={!props.listenNow}
          placeholder={kind === 'none' ? t('voiceTypeOnly') : t('voiceExample')} aria-label={t('titlePh')}
          onInput={(e) => { setEdited(false); setText(e.currentTarget.value); }} />
        {kind !== 'none' && kind !== null && (
          <button class={`mic${listening ? ' live' : ''}`} aria-pressed={listening} aria-label={listening ? t('voiceStop') : t('voiceSpeak')}
            onClick={() => (listening ? void stopListening() : void startListening())}>
            <Icon name={listening ? 'pause' : 'mic'} size={28} />
          </button>
        )}
      </div>
      <p class="composer-state" aria-live="polite">{listening ? t('voiceListening') : cards.length ? t('voiceReview') : kind === 'none' ? '' : t('voiceTap')}</p>
      {error && <p class="inline-error" role="alert">{error}</p>}

      {cards.length > 0 && (
        <ul class="drafts" aria-label={cards.length === 1 ? t('voiceFoundOne') : t('voiceFound', { n: cards.length })}>
          {cards.map((c) => (
            <li class="draft" key={c.key}>
              <div class="draft-top">
                <span class="cat-dot" aria-hidden="true">{CAT_ICON[c.category]}</span>
                <input class="draft-title" value={c.title} aria-label={t('titlePh')}
                  onInput={(e) => { setEdited(true); setCards((cs) => cs.map((x) => (x.key === c.key ? { ...x, title: e.currentTarget.value } : x))); }} />
                <button class="icon-btn" aria-label={t('delete')} onClick={() => { setEdited(true); setCards((cs) => cs.filter((x) => x.key !== c.key)); }}>×</button>
              </div>
              <div class="draft-chips">
                <Pill label={dayLabel(c.offset)} guessed={c.guessed.day} onTap={() => update(c.key, { offset: (c.offset + 1) % 7 }, 'day')} />
                <Pill label={periodName(c.period)} guessed={c.guessed.period} onTap={() => update(c.key, { period: cycle<Period>(PERIOD_ORDER, c.period) }, 'period')} />
                <Pill label={`⏱ ${dur(c.effort)}`} guessed={c.guessed.effort} onTap={() => update(c.key, { effort: nextNum(EFFORTS, c.effort) }, 'effort')} />
                <Pill label={c.wait ? `⏳ ${dur(c.wait)}` : `⏳ ${t('noWait')}`} guessed={c.guessed.wait && c.wait > 0} onTap={() => update(c.key, { wait: nextNum(WAITS, c.wait) }, 'wait')} />
                <Pill label={catName(c.category)} guessed={c.guessed.category} onTap={() => update(c.key, { category: cycle(CATS, c.category) }, 'category')} />
                <Pill label={c.priority ? t('priorityOn') : t('priorityOff')} on={c.priority} onTap={() => { setEdited(true); setCards((cs) => cs.map((x) => (x.key === c.key ? { ...x, priority: !x.priority } : x))); }} />
              </div>
            </li>
          ))}
        </ul>
      )}

      {cards.length <= 1 && text.trim() && (
        <button class="text-btn details-link" onClick={() => props.onDetails(cards[0]?.title ?? text.trim())}>{t('details')} ›</button>
      )}
    </Sheet>
  );
}

function Pill(props: { label: string; guessed?: boolean; on?: boolean; onTap: () => void }) {
  return (
    <button class={`pill${props.guessed ? ' guessed' : ''}${props.on ? ' on' : ''}`} onClick={() => { tap(); props.onTap(); }}>
      {props.label}
    </button>
  );
}
