import { useState } from 'preact/hooks';
import { CATEGORIES, LIMITS, PERIOD_ORDER, type Category, type DB, type Period, type Task, type TaskFields } from '../domain/model';
import { addDays, isDayKey, type DayKey } from '../domain/time';
import { CAT_ICON, catName, dur, periodName, stopwatch, t, weekdayName } from '../i18n';
import { Chips, Icon, Segmented, Sheet, Toggle } from './kit';

const EFFORTS = [5, 10, 15, 20, 30, 45, 60, 90, 120];
const WAITS = [15, 30, 45, 50, 60, 90, 120];
const withValue = (list: number[], v: number) => (list.includes(v) ? list : [...list, v].sort((a, b) => a - b));

export interface SheetActions {
  start: () => void;
  stop: () => void;
  beginWait: () => void;
  cancelWait: () => void;
  tomorrow: () => void;
  remove: () => void;
}

/** Add (no task) or view/edit (task given) in one sheet. */
export function TaskSheet(props: {
  db: DB;
  today: DayKey;
  task?: Task;
  date: DayKey;
  initial?: Partial<TaskFields>;
  now: number;
  onSave: (fields: TaskFields, date: DayKey) => Promise<boolean>;
  actions?: SheetActions;
  onClose: () => void;
}) {
  const base = props.task ?? props.initial ?? {};
  const [title, setTitle] = useState(base.title ?? '');
  const [notes, setNotes] = useState(base.notes ?? '');
  const [period, setPeriod] = useState<Period>(base.period ?? currentPeriod(props.now));
  const [effort, setEffort] = useState(base.effort ?? 15);
  const [wait, setWait] = useState(base.wait ?? 0);
  const [category, setCategory] = useState<Category>(base.category ?? 'home');
  const [priority, setPriority] = useState(!!base.priority);
  const [date, setDate] = useState<DayKey>(props.task?.date ?? props.date);
  const [busy, setBusy] = useState(false);
  const task = props.task;
  const running = task && props.db.active?.taskId === task.id;
  const waiting = task && props.db.waits.find((w) => w.taskId === task.id);
  const isDone = task?.status === 'done';

  const submit = async () => {
    setBusy(true);
    const ok = await props.onSave({ title, notes, period, effort, wait, category, priority }, date);
    setBusy(false);
    if (ok) props.onClose();
  };

  const dayOptions: { value: DayKey; label: string }[] = [
    { value: props.today, label: t('today') },
    { value: addDays(props.today, 1), label: t('tomorrow') }
  ];
  if (!dayOptions.some((o) => o.value === date)) dayOptions.push({ value: date, label: weekdayName(date) });

  return (
    <Sheet tall label={task ? t('details') : t('add')} onClose={props.onClose}
      trailing={<button class="text-btn strong" disabled={busy || !title.trim()} onClick={submit}>{task ? t('save') : t('add')}</button>}>
      <div class="form-group">
        <input class="title-input" value={title} placeholder={t('titlePh')} maxLength={LIMITS.title} autoFocus={!task}
          aria-label={t('titlePh')} onInput={(e) => setTitle(e.currentTarget.value)} />
        <textarea class="notes-input" rows={2} value={notes} placeholder={t('notesPh')} maxLength={LIMITS.notes}
          aria-label={t('notes')} onInput={(e) => setNotes(e.currentTarget.value)} />
      </div>

      {task && !isDone && (
        <div class="action-row">
          {running
            ? <button class="action on" onClick={props.actions!.stop}><Icon name="pause" size={20} />{stopwatch(props.now - props.db.active!.start)}</button>
            : <button class="action" onClick={props.actions!.start}><Icon name="play" size={20} />{t('startTimer')}</button>}
          {task.wait > 0 && (waiting
            ? <button class="action on" onClick={props.actions!.cancelWait}><Icon name="hourglass" size={20} />{waiting.end > props.now ? t('waitLeft', { t: stopwatch(waiting.end - props.now) }) : t('waitDone')}</button>
            : <button class="action" onClick={props.actions!.beginWait}><Icon name="hourglass" size={20} />{t('startWait')}</button>)}
          <button class="action" onClick={props.actions!.tomorrow}><Icon name="arrow" size={20} class="flip" />{t('moveTomorrow')}</button>
        </div>
      )}

      <section class="field">
        <h3>{t('when')}</h3>
        <Chips label={t('day')} value={date} onChange={setDate} options={dayOptions} />
        <input type="date" class="date-input" aria-label={t('otherDay')} value={date} min={props.today}
          onInput={(e) => isDayKey(e.currentTarget.value) && setDate(e.currentTarget.value)} />
        <Segmented label={t('timeOfDay')} value={period} onChange={setPeriod}
          options={PERIOD_ORDER.map((p) => ({ value: p, label: periodName(p) }))} />
      </section>

      <section class="field">
        <h3>{t('effort')}</h3>
        <Chips label={t('effort')} value={effort} onChange={setEffort} options={withValue(EFFORTS, effort).map((m) => ({ value: m, label: dur(m) }))} />
      </section>

      <section class="field">
        <div class="field-head">
          <h3>{t('wait')}</h3>
          <Toggle label={t('wait')} checked={wait > 0} onChange={(on) => setWait(on ? (base.wait || 50) : 0)} />
        </div>
        {wait > 0
          ? <Chips label={t('wait')} value={wait} onChange={setWait} options={withValue(WAITS, wait).map((m) => ({ value: m, label: dur(m) }))} />
          : <p class="hint">{t('waitHint')}</p>}
      </section>

      <section class="field">
        <h3>{catName(category)}</h3>
        <Chips label={catName(category)} value={category} onChange={setCategory}
          options={(Object.keys(CATEGORIES) as Category[]).map((c) => ({ value: c, label: `${CAT_ICON[c]} ${catName(c)}` }))} />
      </section>

      <section class="field row">
        <h3>{t('important')}</h3>
        <Toggle label={t('important')} checked={priority} onChange={setPriority} />
      </section>

      {task && props.actions && (
        <button class="danger-row" onClick={props.actions.remove}><Icon name="trash" size={20} />{t('delete')}</button>
      )}
    </Sheet>
  );
}

export function currentPeriod(now: number): Period {
  const h = new Date(now).getHours();
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
}
