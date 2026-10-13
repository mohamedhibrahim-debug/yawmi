import { useEffect, useState } from 'preact/hooks';
import { LIMITS, PERIOD_ORDER, type Category, type DB, type Language, type Period, type Routine, type Task } from '../domain/model';
import { addRoutine, adjustTime, dayTasks, deleteRoutine, materialize, routinePreview, trackedOnDay, updateRoutine } from '../domain/ops';
import { exportEnvelope, exportFileName, parseBackup } from '../domain/io';
import { addDays, isValidZone, type DayKey } from '../domain/time';
import { CAT_ICON, catName, dayNum, dur, longDate, n, periodName, sep, t, templates, weekdayByIndex, weekStartsOn, weekdayName } from '../i18n';
import { alarmStatus } from '../platform/native';
import type { PersistState } from '../storage/store';
import { Chips, Icon, Segmented, Sheet, Toggle } from './kit';
import { WeekStrip } from './Today';

type Mutate = (fn: (d: DB) => void, ok?: string) => Promise<boolean>;
const EFFORTS = [5, 10, 15, 20, 30, 45, 60, 90, 120];
const WAITS = [15, 30, 45, 50, 60, 90, 120];
const withValue = (list: number[], v: number) => (list.includes(v) ? list : [...list, v].sort((a, b) => a - b));
const weekOrder = () => Array.from({ length: 7 }, (_, i) => (weekStartsOn() + i) % 7);

// ---------- routines ----------

export function RoutinesView(props: { db: DB; today: DayKey; mutate: Mutate }) {
  const { db, today, mutate } = props;
  const [editing, setEditing] = useState<null | { routine?: Routine; template?: Partial<Routine> }>(null);
  const upcoming = Array.from({ length: 7 }, (_, i) => addDays(today, i + 1))
    .map((d) => ({ d, count: routinePreview(db, d).length + dayTasks(db, d).filter((x) => x.routineId && x.status === 'todo').length }))
    .filter((x) => x.count > 0);
  return (
    <div class="screen">
      <header class="large-head">
        <div><h1>{t('routinesTitle')}</h1><p class="subtitle">{t('routineNote')}</p></div>
        <button class="icon-btn accent" aria-label={t('newRoutine')} onClick={() => setEditing({})}><Icon name="plus" /></button>
      </header>
      {db.routines.length === 0 ? (
        <section class="empty">
          <p>{t('routinesEmpty')}</p>
          <div class="tpl-grid">
            {templates().map((tpl) => (
              <button class="tpl" onClick={() => setEditing({ template: { ...tpl, days: [] } })}><span>{tpl.emoji}</span>{tpl.title}<small>{dur(tpl.effort)}</small></button>
            ))}
          </div>
        </section>
      ) : (
        <section class="group">
          <ul class="list">
            {db.routines.map((r) => (
              <li class="row-wrap">
                <div class={`row${r.enabled ? '' : ' muted-row'}`}>
                  <span class="check ghost" aria-hidden="true">{CAT_ICON[r.category]}</span>
                  <button class="row-main" onClick={() => setEditing({ routine: r })}>
                    <span class="row-title">{r.title}</span>
                    <span class="row-meta">{weekOrder().filter((d) => r.days.includes(d)).map((d) => weekdayByIndex(d, true)).join('، ')}{sep()}⏱ {dur(r.effort)}{r.enabled ? '' : `${sep()}${t('paused')}`}</span>
                  </button>
                  <Toggle label={r.enabled ? t('pause') : t('resume')} checked={r.enabled}
                    onChange={(on) => void mutate((d) => updateRoutine(d, r.id, r, r.days, on))} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      {upcoming.length > 0 && (
        <section class="group">
          <div class="group-head"><h2>{t('nextWeek')}</h2></div>
          <ul class="list plain">
            {upcoming.map(({ d, count }) => <li class="kv"><span>{weekdayName(d)} {dayNum(d)}</span><b>{n(count)}</b></li>)}
          </ul>
        </section>
      )}
      {editing && (
        <RoutineSheet routine={editing.routine} template={editing.template} onClose={() => setEditing(null)}
          onSave={(v) => mutate((d) => {
            if (editing.routine) updateRoutine(d, editing.routine.id, v, v.days, v.enabled);
            else { addRoutine(d, v, v.days, today); materialize(d, today); }
          }, t('saved'))}
          onDelete={editing.routine ? () => void mutate((d) => deleteRoutine(d, editing.routine!.id), t('deleted')).then(() => setEditing(null)) : undefined} />
      )}
    </div>
  );
}

interface RoutineValues { title: string; effort: number; wait: number; period: Period; category: Category; priority: boolean; notes: string; days: number[]; enabled: boolean }

function RoutineSheet(props: { routine?: Routine; template?: Partial<Routine>; onSave: (v: RoutineValues) => Promise<boolean>; onClose: () => void; onDelete?: () => void }) {
  const b = props.routine ?? props.template ?? {};
  const [title, setTitle] = useState(b.title ?? '');
  const [effort, setEffort] = useState(b.effort ?? 15);
  const [wait, setWait] = useState(b.wait ?? 0);
  const [period, setPeriod] = useState<Period>(b.period ?? 'morning');
  const [category, setCategory] = useState<Category>(b.category ?? 'home');
  const [days, setDays] = useState<number[]>(b.days ?? []);
  const [enabled, setEnabled] = useState(props.routine?.enabled ?? true);
  const submit = async () => {
    if (await props.onSave({ title, effort, wait, period, category, priority: b.priority ?? false, notes: b.notes ?? '', days, enabled })) props.onClose();
  };
  return (
    <Sheet tall label={props.routine ? t('editRoutine') : t('newRoutine')} onClose={props.onClose}
      trailing={<button class="text-btn strong" disabled={!title.trim() || !days.length} onClick={submit}>{t('save')}</button>}>
      <div class="form-group">
        <input class="title-input" value={title} placeholder={t('titlePh')} maxLength={LIMITS.title} aria-label={t('titlePh')} onInput={(e) => setTitle(e.currentTarget.value)} />
      </div>
      <section class="field">
        <h3>{t('repeatDays')}</h3>
        <div class="chips" role="group" aria-label={t('repeatDays')}>
          {weekOrder().map((d) => (
            <button class={`chip${days.includes(d) ? ' on' : ''}`} aria-pressed={days.includes(d)}
              onClick={() => setDays(days.includes(d) ? days.filter((x) => x !== d) : [...days, d])}>{weekdayByIndex(d, true)}</button>
          ))}
        </div>
      </section>
      <section class="field"><h3>{t('timeOfDay')}</h3>
        <Segmented label={t('timeOfDay')} value={period} onChange={setPeriod} options={PERIOD_ORDER.map((p) => ({ value: p, label: periodName(p) }))} />
      </section>
      <section class="field"><h3>{t('effort')}</h3>
        <Chips label={t('effort')} value={effort} onChange={setEffort} options={withValue(EFFORTS, effort).map((m) => ({ value: m, label: dur(m) }))} />
      </section>
      <section class="field">
        <div class="field-head"><h3>{t('wait')}</h3><Toggle label={t('wait')} checked={wait > 0} onChange={(on) => setWait(on ? 50 : 0)} /></div>
        {wait > 0 && <Chips label={t('wait')} value={wait} onChange={setWait} options={withValue(WAITS, wait).map((m) => ({ value: m, label: dur(m) }))} />}
      </section>
      <section class="field"><h3>{catName(category)}</h3>
        <Chips label={catName(category)} value={category} onChange={setCategory}
          options={(['home', 'food', 'kids', 'self', 'other'] as Category[]).map((c) => ({ value: c, label: `${CAT_ICON[c]} ${catName(c)}` }))} />
      </section>
      {props.routine && <section class="field row"><h3>{enabled ? t('pause') : t('resume')}</h3><Toggle label={t('pause')} checked={enabled} onChange={setEnabled} /></section>}
      {props.onDelete && <button class="danger-row" onClick={props.onDelete}><Icon name="trash" size={20} />{t('delete')}</button>}
    </Sheet>
  );
}

// ---------- history ----------

export function HistoryView(props: { db: DB; today: DayKey; date: DayKey; setDate: (d: DayKey) => void; now: number; mutate: Mutate }) {
  const { db, date, now, mutate } = props;
  const [adjusting, setAdjusting] = useState<Task | null>(null);
  const tasks = dayTasks(db, date);
  const done = tasks.filter((x) => x.status === 'done').length;
  const minutes = Math.round(trackedOnDay(db, date, now) / 60000);
  const perTask = (task: Task) => {
    const one: DB = { ...db, sessions: db.sessions.filter((s) => s.taskId === task.id), adjustments: db.adjustments.filter((a) => a.taskId === task.id), active: db.active?.taskId === task.id ? db.active : null };
    return trackedOnDay(one, date, now) / 60000;
  };
  return (
    <div class="screen">
      <header class="large-head"><div><h1>{t('historyTitle')}</h1><p class="subtitle">{t('historyHint')}</p></div></header>
      <WeekStrip db={db} date={date} today={props.today} onPick={props.setDate} />
      <div class="stats">
        <div><b>{n(done)}</b><span>{t('statDone')}</span></div>
        <div><b>{n(minutes)}</b><span>{t('statMinutes')}</span></div>
        <div><b>{n(tasks.length - done)}</b><span>{t('statLeft')}</span></div>
      </div>
      {tasks.length === 0 ? <p class="hint center">{t('historyEmpty')}</p> : (
        <section class="group">
          <ul class="list">
            {tasks.map((task) => (
              <li class="row-wrap">
                <button class={`row${task.status === 'done' ? ' done' : ''}`} onClick={() => setAdjusting(task)}>
                  <span class={`check${task.status === 'done' ? ' on' : ''}`} aria-hidden="true">{task.status === 'done' && <Icon name="check" size={16} />}</span>
                  <span class="row-main">
                    <span class="row-title">{task.title}</span>
                    <span class="row-meta">{t('expected', { a: dur(task.effort) })}{sep()}{t('tracked', { a: dur(perTask(task)) })}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {adjusting && <AdjustSheet task={adjusting} date={date} minutes={perTask(adjusting)} onClose={() => setAdjusting(null)}
        onSave={(delta) => mutate((d) => adjustTime(d, adjusting.id, date, delta), t('saved'))} />}
    </div>
  );
}

function AdjustSheet(props: { task: Task; date: DayKey; minutes: number; onSave: (delta: number) => Promise<boolean>; onClose: () => void }) {
  const [value, setValue] = useState(String(Math.round(props.minutes)));
  const submit = async () => {
    const delta = Math.round(Number(value)) - Math.round(props.minutes);
    if (!delta || (await props.onSave(delta))) props.onClose();
  };
  return (
    <Sheet title={t('adjust')} onClose={props.onClose} trailing={<button class="text-btn strong" onClick={submit}>{t('save')}</button>}>
      <p><b>{props.task.title}</b>{sep()}{longDate(props.date)}</p>
      <label class="stack">{t('adjustLabel')}
        <input class="num-input" type="number" inputMode="numeric" min={0} max={LIMITS.adjustMax} value={value} onInput={(e) => setValue(e.currentTarget.value)} />
      </label>
    </Sheet>
  );
}

// ---------- settings ----------

export function SettingsSheet(props: { db: DB; persist: PersistState | null; mutate: Mutate; onRestore: (db: DB) => Promise<void>; onClose: () => void; showToast: (s: string) => void }) {
  const s = props.db.settings;
  const [pending, setPending] = useState<DB | null>(null);
  const [alarms, setAlarms] = useState<string | null>(null);
  useEffect(() => { void alarmStatus().then(setAlarms); }, []);
  const set = (patch: Partial<DB['settings']>) => void props.mutate((d) => { d.settings = { ...d.settings, ...patch }; });
  const zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [s.zone];

  const download = () => {
    const blob = new Blob([JSON.stringify(exportEnvelope(props.db), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = exportFileName();
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    props.showToast(t('backupSaved'));
  };
  const pick = async (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try { setPending(parseBackup(await file.text(), s.zone)); } catch { props.showToast(t('invalidFile')); }
  };

  return (
    <Sheet tall title={t('settings')} onClose={props.onClose} leading={<span />} trailing={<button class="text-btn strong" onClick={props.onClose}>{t('ok')}</button>}>
      <div class="brand-row"><img src={`${import.meta.env.BASE_URL}logo.svg`} alt="" /><div><b>{t('appName')}</b><small>v0.2</small></div></div>

      <h3 class="list-label">{t('general')}</h3>
      <div class="settings-list">
        <div class="set-row"><span>{t('setLanguage')}</span>
          <Segmented<Language> label={t('setLanguage')} value={s.language} onChange={(v) => set({ language: v })}
            options={[{ value: 'auto', label: t('langAuto') }, { value: 'ar', label: 'العربية' }, { value: 'en', label: 'English' }]} />
        </div>
        <label class="set-row"><span>{t('setName')}</span>
          <input value={s.name} maxLength={LIMITS.name} onChange={(e) => set({ name: e.currentTarget.value.trim() })} />
        </label>
      </div>

      <h3 class="list-label">{t('aboutDay')}</h3>
      <div class="settings-list">
        <div class="set-row col"><span>{t('setCapacity')}</span>
          <Chips label={t('setCapacity')} value={s.capacity} onChange={(v) => set({ capacity: v })}
            options={withValue([90, 120, 180, 240, 300, 360], s.capacity).map((m) => ({ value: m, label: dur(m) }))} />
        </div>
        <label class="set-row"><span>{t('setStart')}</span>
          <input type="time" value={s.start} onChange={(e) => /^\d\d:\d\d$/.test(e.currentTarget.value) && set({ start: e.currentTarget.value })} />
        </label>
        <label class="set-row"><span>{t('setZone')}</span>
          <input list="zones" dir="ltr" value={s.zone} onChange={(e) => isValidZone(e.currentTarget.value) && set({ zone: e.currentTarget.value })} />
          <datalist id="zones">{zones.map((z) => <option value={z} />)}</datalist>
        </label>
      </div>

      <h3 class="list-label">{t('notifications')}</h3>
      <div class="settings-list"><p class="set-note">{alarms === 'granted' ? t('notifOn') : alarms === 'web' ? t('notifWeb') : t('notifOff')}</p></div>

      <h3 class="list-label">{t('setData')}</h3>
      <div class="settings-list">
        <p class="set-note">{t('dataLocal')} {props.persist === 'persisted' ? '' : t('persistBest')}</p>
        <button class="set-row link-row" onClick={download}>{t('backup')}</button>
        <label class="set-row link-row">{t('restore')}<input type="file" accept="application/json,.json" class="visually-hidden" onChange={pick} /></label>
      </div>
      {pending && (
        <div class="confirm" role="alert">
          <p>{t('restoreConfirm', { t: pending.tasks.filter((x) => x.status !== 'deleted').length, r: pending.routines.length })}</p>
          <div class="confirm-btns"><button class="text-btn" onClick={() => setPending(null)}>{t('cancel')}</button>
            <button class="btn danger" onClick={async () => { pending.settings.onboarded = true; await props.onRestore(pending); setPending(null); props.onClose(); }}>{t('replace')}</button></div>
        </div>
      )}
    </Sheet>
  );
}

// ---------- welcome (2 taps) ----------

export function WelcomeSheet(props: { db: DB; onDone: (patch: Partial<DB['settings']>) => void }) {
  const [name, setName] = useState(props.db.settings.name);
  const [capacity, setCapacity] = useState(180);
  const finish = () => props.onDone({ name: name.trim(), capacity, onboarded: true });
  return (
    <Sheet label={t('welcome')} onClose={finish} leading={<span />} trailing={<button class="text-btn" onClick={finish}>{t('close')}</button>}>
      <div class="welcome">
        <img src={`${import.meta.env.BASE_URL}logo.svg`} alt={t('appName')} class="welcome-logo" />
        <h2>{t('welcome')}</h2>
        <p>{t('welcomeBody')}</p>
        <input class="title-input center" value={name} maxLength={LIMITS.name} placeholder={t('nameOptional')} aria-label={t('nameOptional')} onInput={(e) => setName(e.currentTarget.value)} />
        <h3>{t('dayKind')}</h3>
        <Segmented<string> label={t('dayKind')} value={String(capacity)} onChange={(v) => setCapacity(Number(v))}
          options={[{ value: '90', label: `${t('light')}${sep()}${dur(90)}` }, { value: '180', label: `${t('normal')}${sep()}${dur(180)}` }, { value: '300', label: `${t('heavy')}${sep()}${dur(300)}` }]} />
        <button class="btn primary wide" onClick={finish}>{t('start')}</button>
      </div>
    </Sheet>
  );
}
