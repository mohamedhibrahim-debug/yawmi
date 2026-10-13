import { useRef, useState } from 'preact/hooks';
import { PERIOD_ORDER, type DB, type Task } from '../domain/model';
import { dayTasks, overdue, plan, plannedEffort, routinePreview, trackedForTask, materialize } from '../domain/ops';
import { addDays, minutesOfDay, type DayKey } from '../domain/time';
import { CAT_ICON, clock, dayNum, dur, longDate, n, periodName, sep, stopwatch, t, templates, weekStartsOn, weekdayName, isRTL } from '../i18n';
import { tap } from '../platform/native';
import { Icon, Sheet } from './kit';

export interface RowActions {
  open: (task: Task) => void;
  toggle: (task: Task) => void;
  start: (task: Task) => void;
  tomorrow: (task: Task) => void;
}

// ---------- week strip ----------

export function WeekStrip(props: { db: DB; date: DayKey; today: DayKey; onPick: (d: DayKey) => void }) {
  const back = (new Date(Date.UTC(+props.date.slice(0, 4), +props.date.slice(5, 7) - 1, +props.date.slice(8, 10))).getUTCDay() - weekStartsOn() + 7) % 7;
  const first = addDays(props.date, -back);
  const days = Array.from({ length: 7 }, (_, i) => addDays(first, i));
  return (
    <div class="week" role="group" aria-label={longDate(props.date)}>
      {days.map((d) => {
        const has = dayTasks(props.db, d).some((x) => x.status === 'todo') || (d > props.today && routinePreview(props.db, d).length > 0);
        return (
          <button class={`wday${d === props.date ? ' on' : ''}${d === props.today ? ' today' : ''}`} aria-pressed={d === props.date}
            aria-label={longDate(d)} onClick={() => { tap(); props.onPick(d); }}>
            <span class="wd">{weekdayName(d, true)}</span>
            <span class="wn">{dayNum(d)}</span>
            <i class={has ? 'dot' : 'dot off'} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}

// ---------- task row with swipe actions ----------

function TaskRow(props: { task: Task; db: DB; now: number; actions: RowActions; preview?: boolean; onPreviewAdd?: () => void }) {
  const { task, db, now, actions } = props;
  const running = db.active?.taskId === task.id;
  const waiting = db.waits.find((w) => w.taskId === task.id);
  const isDone = task.status === 'done';
  const [dx, setDx] = useState(0);
  // One gesture is either a scroll or a swipe, decided once from its first clear movement.
  const gesture = useRef<{ x: number; y: number; id: number; mode: 'undecided' | 'swipe' | 'scroll'; armed: boolean } | null>(null);
  const moved = useRef(false);
  const TRIGGER = 110; // px a swipe must travel before letting go acts

  // Leading swipe = start timer, trailing swipe = tomorrow. Mirrors in RTL.
  const onDown = (e: PointerEvent) => {
    moved.current = false;
    if (props.preview || isDone || e.pointerType === 'mouse' && e.button !== 0) return;
    gesture.current = { x: e.clientX, y: e.clientY, id: e.pointerId, mode: 'undecided', armed: false };
  };
  const onMove = (e: PointerEvent) => {
    const g = gesture.current;
    if (!g || g.mode === 'scroll') return;
    const ddx = e.clientX - g.x;
    const ddy = e.clientY - g.y;
    if (g.mode === 'undecided') {
      if (Math.abs(ddy) > 8 && Math.abs(ddy) >= Math.abs(ddx) * 0.6) { g.mode = 'scroll'; moved.current = true; return; }
      if (Math.abs(ddx) > 16 && Math.abs(ddx) > Math.abs(ddy) * 2) {
        g.mode = 'swipe';
        moved.current = true;
        (e.currentTarget as HTMLElement).setPointerCapture?.(g.id);
      } else return;
    }
    const shown = ddx - Math.sign(ddx) * 16;
    const clamped = Math.max(-TRIGGER * 1.3, Math.min(TRIGGER * 1.3, shown));
    const armed = Math.abs(clamped) >= TRIGGER;
    if (armed !== g.armed) { g.armed = armed; if (armed) tap(); } // a tick when letting go would act
    setDx(clamped);
  };
  const onUp = () => {
    const g = gesture.current;
    gesture.current = null;
    if (!g || g.mode !== 'swipe') { setDx(0); return; }
    const leading = isRTL() ? dx < 0 : dx > 0;
    if (Math.abs(dx) >= TRIGGER) {
      if (leading) actions.start(task);
      else actions.tomorrow(task);
    }
    setDx(0);
  };

  const meta: string[] = [];
  if (props.preview) meta.push(t('fromRoutine'));
  meta.push(`⏱ ${dur(task.effort)}`);
  if (waiting) meta.push(waiting.end > now ? `⏳ ${t('waitLeft', { t: stopwatch(waiting.end - now) })}` : `⏳ ${t('waitDone')}`);
  else if (task.wait) meta.push(`⏳ ${dur(task.wait)}`);
  if (task.routineId && !props.preview) meta.push('↻');
  const tracked = trackedForTask(db, task.id, now);
  if (!running && tracked >= 60_000 && !isDone) meta.push(t('tracked', { a: dur(tracked / 60000) }));

  const leadingSide = isRTL() ? 'right' : 'left';
  return (
    <li class={`row-wrap${props.preview ? ' preview' : ''}`}>
      {dx !== 0 && (
        <div class={`swipe-bg${Math.abs(dx) >= TRIGGER ? ' armed' : ''}`} style={{ justifyContent: (dx > 0) ? 'flex-start' : 'flex-end' }}>
          {((dx > 0 && leadingSide === 'left') || (dx < 0 && leadingSide === 'right'))
            ? <span class="swipe-act start"><Icon name="play" size={20} />{t('swipeStart')}</span>
            : <span class="swipe-act later">{t('swipeTomorrow')}</span>}
        </div>
      )}
      <div class={`row${isDone ? ' done' : ''}${running ? ' running' : ''}`} style={{ transform: dx ? `translateX(${dx}px)` : undefined }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => { gesture.current = null; setDx(0); }}>
        {props.preview ? (
          <span class="check ghost" aria-hidden="true">↻</span>
        ) : (
          <button class={`check${isDone ? ' on' : ''}${task.priority ? ' prio' : ''}`} aria-pressed={isDone}
            aria-label={task.title} onClick={(e) => { e.stopPropagation(); tap(); actions.toggle(task); }}>
            {isDone && <Icon name="check" size={16} />}
          </button>
        )}
        <button class="row-main" onClick={() => { if (moved.current) return; props.preview ? props.onPreviewAdd?.() : actions.open(task); }}>
          <span class="row-title">{task.title}</span>
          <span class="row-meta">{CAT_ICON[task.category]} {meta.join(sep())}</span>
        </button>
        {running && <span class="row-live">{stopwatch(now - db.active!.start)}</span>}
      </div>
    </li>
  );
}

// ---------- now strip: running timer and waits ----------

export function NowStrip(props: { db: DB; now: number; onOpen: (t: Task) => void; onStop: () => void }) {
  const { db, now } = props;
  const active = db.active ? db.tasks.find((x) => x.id === db.active!.taskId) : undefined;
  const waits = db.waits.map((w) => ({ w, task: db.tasks.find((x) => x.id === w.taskId) })).filter((x) => x.task);
  if (!active && !waits.length) return null;
  return (
    <div class="now-strip" role="status">
      {active && (
        <div class="now-item">
          <button class="now-main" onClick={() => props.onOpen(active)}><span class="pulse" />{active.title}<b>{stopwatch(now - db.active!.start)}</b></button>
          <button class="round-btn" aria-label={t('stopTimer')} onClick={props.onStop}><Icon name="pause" size={18} /></button>
        </div>
      )}
      {waits.map(({ w, task }) => (
        <div class={`now-item wait${w.end <= now ? ' ready' : ''}`}>
          <button class="now-main" onClick={() => props.onOpen(task!)}>
            <Icon name="hourglass" size={16} />{task!.title}<b>{w.end > now ? stopwatch(w.end - now) : t('waitDone')}</b>
          </button>
        </div>
      ))}
    </div>
  );
}

// ---------- today ----------

export function TodayView(props: {
  db: DB; today: DayKey; date: DayKey; setDate: (d: DayKey) => void; now: number;
  actions: RowActions; onAddTemplate: (i: number) => void; onSettings: () => void;
  mutate: (fn: (d: DB) => void, ok?: string) => Promise<boolean>; onBringForward: (ids: string[]) => void;
}) {
  const { db, date, today, now, actions } = props;
  const [showDone, setShowDone] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const tasks = dayTasks(db, date);
  const todo = tasks.filter((x) => x.status === 'todo');
  const done = tasks.filter((x) => x.status === 'done');
  const preview = date > today ? routinePreview(db, date) : [];
  const late = date === today ? overdue(db, today) : [];
  const left = plannedEffort(db, date);
  const isToday = date === today;
  const name = db.settings.name.trim();

  const summary = !tasks.length && !preview.length ? t('summaryEmpty') : !todo.length ? t('summaryAllDone')
    : t('summary', { done: done.length, total: tasks.length, left: dur(left) });

  return (
    <div class="screen">
      <header class="large-head">
        <div>
          <h1>{isToday ? (name ? t('greeting', { name }) : t('tabToday')) : weekdayName(date)}</h1>
          <button class="subtitle" onClick={() => todo.length && setPlanOpen(true)} disabled={!todo.length}>
            {longDate(date)}{sep()}{summary}
          </button>
        </div>
        <button class="icon-btn gear" aria-label={t('settings')} onClick={props.onSettings}><Icon name="settings" /></button>
      </header>

      <WeekStrip db={db} date={date} today={today} onPick={props.setDate} />

      {late.length > 0 && (
        <section class="group soft">
          <div class="group-head"><h2>{t('overdue')} ({n(late.length)})</h2>
            <button class="text-btn" onClick={() => props.onBringForward(late.map((x) => x.id))}>{t('moveAllToday')}</button></div>
          <ul class="list">{late.slice(0, 3).map((task) => <TaskRow key={task.id} task={task} db={db} now={now} actions={actions} />)}</ul>
        </section>
      )}

      {!tasks.length && !preview.length ? (
        <section class="empty">
          <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="" class="empty-logo" />
          <h2>{t('emptyTitle')}</h2>
          <p>{t('emptyBody')}</p>
          <div class="tpl-grid">
            {templates().map((tpl, i) => (
              <button class="tpl" onClick={() => props.onAddTemplate(i)}><span>{tpl.emoji}</span>{tpl.title}<small>{dur(tpl.effort)}</small></button>
            ))}
          </div>
        </section>
      ) : (
        PERIOD_ORDER.map((p) => {
          const items = todo.filter((x) => x.period === p);
          const prev = preview.filter((x) => x.period === p);
          if (!items.length && !prev.length) return null;
          const effort = items.reduce((s, x) => s + x.effort, 0);
          return (
            <section class="group" key={p}>
              <div class="group-head"><h2>{periodName(p)}</h2>{effort > 0 && <span>{dur(effort)}</span>}</div>
              <ul class="list">
                {items.map((task) => <TaskRow key={task.id} task={task} db={db} now={now} actions={actions} />)}
                {prev.map((task) => (
                  <TaskRow key={task.id} task={task} db={db} now={now} actions={actions} preview
                    onPreviewAdd={() => void props.mutate((d) => void materialize(d, date), t('addedOne'))} />
                ))}
              </ul>
            </section>
          );
        })
      )}

      {done.length > 0 && (
        <section class="group">
          <button class="group-head toggle" aria-expanded={showDone} onClick={() => setShowDone(!showDone)}>
            <h2>{t('doneCount', { n: done.length })}</h2><span>{showDone ? '−' : '+'}</span>
          </button>
          {showDone && <ul class="list">{done.map((task) => <TaskRow key={task.id} task={task} db={db} now={now} actions={actions} />)}</ul>}
        </section>
      )}

      {planOpen && <PlanSheet db={db} date={date} now={now} isToday={isToday} onClose={() => setPlanOpen(false)} />}
    </div>
  );
}

function PlanSheet(props: { db: DB; date: DayKey; now: number; isToday: boolean; onClose: () => void }) {
  const { db, date } = props;
  const rows = plan(db, date, props.isToday ? minutesOfDay(props.now, db.settings.zone) : undefined);
  const byId = new Map(dayTasks(db, date).map((x) => [x.id, x]));
  const used = plannedEffort(db, date);
  const over = used > db.settings.capacity;
  return (
    <Sheet title={t('plan')} onClose={props.onClose} leading={<span />} trailing={<button class="text-btn strong" onClick={props.onClose}>{t('ok')}</button>}>
      <p class="hint">{t('planHint')}</p>
      {!rows.length ? <p>{t('planEmpty')}</p> : (
        <ol class="plan">
          {rows.map((r) => {
            const task = byId.get(r.id)!;
            return (
              <li class={r.over ? 'over' : ''}>
                <span class="plan-time">{clock(r.start)}</span>
                <span class="plan-title">{CAT_ICON[task.category]} {task.title}</span>
                <span class="plan-meta">{dur(task.effort)}{task.wait ? `${sep()}${t('readyAt', { t: clock(r.ready) })}` : ''}{r.over ? `${sep()}${t('planOver')}` : ''}</span>
              </li>
            );
          })}
        </ol>
      )}
      <p class={`plan-foot${over ? ' warn' : ''}`}>{t(over ? 'planFull' : 'planFits', { used: dur(used), cap: dur(db.settings.capacity) })}</p>
    </Sheet>
  );
}
