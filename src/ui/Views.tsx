import { useEffect, useState } from 'preact/hooks';
import { alarmStatus } from '../platform/native';
import { CATEGORIES, PERIODS, PERIOD_ORDER, TEMPLATES, type Category, type DB, type Task } from '../domain/model';
import {
  adjustTime, beginWait, cancelWait, dayTasks, move, plannedEffort, remove, restore, routinePreview,
  start, stop, toggleDone, trackedForTask, trackedOnDay, materialize, addTask, updateTask,
  addRoutine, updateRoutine, deleteRoutine
} from '../domain/ops';
import { addDays, todayKey, weekday, type DayKey } from '../domain/time';

const SHORT_DAYS = ['حد', 'اتنين', 'تلات', 'أربع', 'خميس', 'جمعة', 'سبت'];
import type { Store } from './useStore';
import { dayNumber, longDate, minutesLabel, n, stopwatch, weekdayName, weekStart, WEEKDAYS, WEEK_ORDER } from './format';
import { AdjustModal, MoveModal, PlanModal, TaskForm, type FormResult } from './Modals';

type Mutate = Store['mutate'];

// ---------- week strip ----------

export function WeekStrip(props: { db: DB; date: DayKey; today: DayKey; onPick: (d: DayKey) => void; counts?: boolean }) {
  const first = weekStart(props.date, addDays);
  const days = Array.from({ length: 7 }, (_, i) => addDays(first, i));
  return (
    <div class="week">
      <button class="quiet week-nav" aria-label="الأسبوع اللي فات" onClick={() => props.onPick(addDays(props.date, -7))}>›</button>
      <div class="date-strip" role="tablist" aria-label="أيام الأسبوع">
        {days.map((d) => {
          const count = props.counts
            ? dayTasks(props.db, d).filter((t) => t.status === 'todo').length + (d > props.today ? routinePreview(props.db, d).length : 0)
            : 0;
          return (
            <button role="tab" aria-selected={d === props.date} class={`day${d === props.date ? ' active' : ''}${d === props.today ? ' today' : ''}`} onClick={() => props.onPick(d)}>
              <span class="long">{d === props.today ? 'النهارده' : weekdayName(d)}</span>
              <span class="short" aria-hidden="true">{d === props.today ? 'النهارده' : SHORT_DAYS[weekday(d)]}</span>
              <strong>{dayNumber(d)}</strong>
              {count > 0 && <i class="dot" aria-label={`${n(count)} حاجة`}>{n(count)}</i>}
            </button>
          );
        })}
      </div>
      <button class="quiet week-nav" aria-label="الأسبوع الجاي" onClick={() => props.onPick(addDays(props.date, 7))}>‹</button>
      <label class="date-picker" title="اختاري يوم">
        <span aria-hidden="true">▦</span>
        <input type="date" aria-label="اختاري يوم" value={props.date}
          onClick={(e) => { try { e.currentTarget.showPicker?.(); } catch { /* older browsers open on click anyway */ } }}
          onInput={(e) => e.currentTarget.value && props.onPick(e.currentTarget.value)} />
      </label>
    </div>
  );
}

// ---------- today ----------

export function TodayView(props: { db: DB; mutate: Mutate; date: DayKey; setDate: (d: DayKey) => void; now: number; showToast: (m: string) => void; onVoice: (typing: boolean) => void }) {
  const { db, mutate, date, now } = props;
  const today = todayKey(db.settings.zone, now);
  const [filter, setFilter] = useState<Category | 'all'>('all');
  const [form, setForm] = useState<null | { task?: Task; template?: Partial<FormResult> }>(null);
  const [moving, setMoving] = useState<Task | null>(null);
  const [showPlan, setShowPlan] = useState(false);
  const [lastDeleted, setLastDeleted] = useState<Task | null>(null);

  const tasks = dayTasks(db, date);
  const preview = date > today ? routinePreview(db, date) : [];
  const visible = tasks.filter((t) => filter === 'all' || t.category === filter);
  const usedCats = [...new Set(tasks.map((t) => t.category))];
  const done = tasks.filter((t) => t.status === 'done').length;
  const planned = plannedEffort(db, date);
  const pct = Math.min(100, Math.round((planned / db.settings.capacity) * 100));
  const perPeriod = PERIOD_ORDER.map((p) => tasks.filter((t) => t.period === p && t.status === 'todo').length);
  const waits = db.waits.map((w) => ({ w, t: db.tasks.find((t) => t.id === w.taskId)! })).filter((x) => x.t);

  const save = (f: FormResult) =>
    form?.task
      ? mutate((d) => updateTask(d, form.task!.id, f), 'اتحفظ')
      : mutate((d) => void addTask(d, f, date), date === today ? 'اتضافت ليومك' : `اتضافت ليوم ${weekdayName(date)}`);

  const del = async (t: Task) => {
    if (await mutate((d) => remove(d, t.id))) {
      setLastDeleted(t);
      setForm(null);
    }
  };

  return (
    <>
      <div class="page-heading">
        <div>
          <span class="eyebrow">{date === today ? 'يوم جديد، على مهلك' : longDate(date)}</span>
          <h1>{db.settings.name ? `يومك يا ${db.settings.name}` : 'يوم البيت على راحتك'} <span class="leaf-inline">❋</span></h1>
          <p>حاجة ورا حاجة، وسيبي في اليوم مساحة ليكي.</p>
        </div>
      </div>
      <div class="add-row">
        <button class="primary voice-cta" onClick={() => props.onVoice(false)}>
          <svg viewBox="0 0 24 24" aria-hidden="true" class="ico"><path fill="currentColor" d="M12 15a3.5 3.5 0 0 0 3.5-3.5v-6a3.5 3.5 0 1 0-7 0v6A3.5 3.5 0 0 0 12 15Zm6-3.5a1 1 0 1 0-2 0 4 4 0 0 1-8 0 1 1 0 1 0-2 0 6 6 0 0 0 5 5.9V20H8.5a1 1 0 1 0 0 2h7a1 1 0 1 0 0-2H13v-2.6a6 6 0 0 0 5-5.9Z" /></svg>
          قولي اللي وراكي
        </button>
        <button class="soft" onClick={() => setForm({})}>✎ اكتبي</button>
      </div>

      <WeekStrip db={db} date={date} today={today} onPick={props.setDate} counts />

      <div class="content-grid">
        <section class="card" aria-labelledby="tasks-h">
          <div class="section-head">
            <h2 id="tasks-h">{date === today ? 'حاجات النهارده' : `حاجات ${weekdayName(date)}`} <small>({n(tasks.length)})</small></h2>
            {tasks.some((t) => t.status === 'todo') && <button class="quiet small" onClick={() => setShowPlan(true)}>رتّبي يومي ↗</button>}
          </div>

          {usedCats.length > 1 && (
            <div class="filters" role="group" aria-label="تصفية حسب القسم">
              <button class={`chip${filter === 'all' ? ' active' : ''}`} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>الكل</button>
              {usedCats.map((c) => (
                <button class={`chip${filter === c ? ' active' : ''}`} aria-pressed={filter === c} onClick={() => setFilter(c)}>{CATEGORIES[c]}</button>
              ))}
            </div>
          )}

          {lastDeleted && (
            <div class="note" role="status">
              اتشالت «{lastDeleted.title}».{' '}
              <button class="link" onClick={() => mutate((d) => restore(d, lastDeleted.id)).then(() => setLastDeleted(null))}>رجّعيها</button>
            </div>
          )}

          {tasks.length === 0 && preview.length === 0 ? (
            <div class="empty">
              <div class="empty-icon">⌂</div>
              <h3>نبدأ بحاجة بسيطة؟</h3>
              <p class="muted">اختاري حاجة من دول وعدّليها على يومك، أو ضيفي حاجة جديدة. مفيش جدول مفروض عليكي.</p>
              <div class="templates">
                {TEMPLATES.map(({ emoji, ...tpl }) => (
                  <button class="template" onClick={() => setForm({ template: tpl })}>
                    <span class="emoji">{emoji}</span><strong>{tpl.title}</strong>
                    <span class="muted">{n(tpl.effort)} دقيقة مجهود{tpl.wait ? ' + انتظار' : ''}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <ul class="tasks">
              {visible.map((t) => (
                <TaskRow key={t.id} t={t} db={db} now={now} mutate={mutate} today={today}
                  onEdit={() => setForm({ task: t })} onMove={() => setMoving(t)} />
              ))}
              {preview.filter((t) => filter === 'all' || t.category === filter).map((t) => (
                <li class="task preview" key={t.id}>
                  <span class="task-check ghost" aria-hidden="true">↻</span>
                  <div class="task-body">
                    <div class="task-title">{t.title}</div>
                    <div class="meta"><span class="tag">من روتينك</span><span>◷ {minutesLabel(t.effort)}</span><span>{PERIODS[t.period]}</span></div>
                  </div>
                  <button class="small soft" onClick={() => mutate((d) => void materialize(d, date), 'اتضافت')}>أضيفيها دلوقتي</button>
                </li>
              ))}
            </ul>
          )}
          {done > 0 && <p class="muted done-line">✓ خلصتي {n(done)} من {n(tasks.length)}. كل حاجة عملتيها بتفرق.</p>}
        </section>

        <aside class="side">
          <section class="card space" aria-labelledby="space-h">
            <div class="section-head"><h2 id="space-h">مساحة يومك</h2><span aria-hidden="true">◴</span></div>
            <p class="big">{n(planned)} <small>دقيقة مجهود مخططة</small></p>
            <div class={`bar${planned > db.settings.capacity ? ' over' : ''}`} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><span style={{ inlineSize: `${pct}%` }} /></div>
            <p class="muted">من {n(db.settings.capacity)} دقيقة متاحة.{planned > db.settings.capacity ? ' اليوم مليان شوية.' : ''}</p>
            <div class="periods">
              {PERIOD_ORDER.map((p, i) => <div><span>{PERIODS[p]}</span><strong>{n(perPeriod[i])}</strong></div>)}
            </div>
            {tasks.some((t) => t.status === 'todo') && <button class="soft full" onClick={() => setShowPlan(true)}>رتّبي يومي ←</button>}
          </section>

          {waits.length > 0 && (
            <section class="card" aria-labelledby="waits-h">
              <div class="section-head"><h2 id="waits-h">حاجات مستنية</h2></div>
              <ul class="waits">
                {waits.map(({ w, t }) => {
                  const left = w.end - now;
                  return (
                    <li>
                      <span>{t.title}</span>
                      {left > 0 ? <strong class="count">{stopwatch(left)}</strong> : <strong class="ready">خلصت ✓</strong>}
                      <button class="quiet small" onClick={() => mutate((d) => cancelWait(d, t.id))}>{left > 0 ? 'إلغاء' : 'تمام'}</button>
                    </li>
                  );
                })}
              </ul>
              <NotifyHint showToast={props.showToast} />
            </section>
          )}

          <section class="card peach">
            <div class="section-head"><h2>ونفسك ليها وقت</h2><span aria-hidden="true">☼</span></div>
            <p class="muted">حتى عشر دقايق هادية. مش لازم تستني كل حاجة تخلص.</p>
            <button onClick={() => setForm({ template: { ...TEMPLATES[3], effort: 10 } })}>＋ وقت لنفسي</button>
          </section>
        </aside>
      </div>

      {form && (
        <TaskForm title={form.task ? 'تعديل' : 'إيه اللي وراكي؟'} submitLabel={form.task ? 'حفظ' : 'إضافة'}
          initial={form.task ?? form.template} onSubmit={save} onClose={() => setForm(null)}
          onDelete={form.task ? () => del(form.task!) : undefined} />
      )}
      {moving && <MoveModal task={moving} zone={db.settings.zone} onClose={() => setMoving(null)}
        onSubmit={(d) => mutate((x) => move(x, moving.id, d), `اتنقلت ليوم ${weekdayName(d)}`)} />}
      {showPlan && <PlanModal db={db} date={date} now={now} onClose={() => setShowPlan(false)} />}
    </>
  );
}

function TaskRow(props: { t: Task; db: DB; now: number; mutate: Mutate; today: DayKey; onEdit: () => void; onMove: () => void }) {
  const { t, db, now, mutate } = props;
  const active = db.active?.taskId === t.id;
  const waiting = db.waits.find((w) => w.taskId === t.id);
  const isDone = t.status === 'done';
  const tracked = trackedForTask(db, t.id, now);
  return (
    <li class={`task${isDone ? ' done' : ''}${active ? ' running' : ''}`}>
      <button class={`task-check${isDone ? ' done' : ''}`} aria-pressed={isDone} aria-label={isDone ? `رجّعي «${t.title}» لسه` : `خلصت «${t.title}»`}
        onClick={() => mutate((d) => toggleDone(d, t.id), isDone ? undefined : 'برافو عليكي ✓')}>{isDone ? '✓' : ''}</button>
      <div class="task-body">
        <button class="task-title" onClick={props.onEdit}>{t.title}{t.priority && <span class="star" aria-label="مهمة">★</span>}</button>
        <div class="meta">
          <span class="tag">{CATEGORIES[t.category]}</span>
          <span>◷ {minutesLabel(t.effort)} مجهود</span>
          {t.wait > 0 && <span>＋ {minutesLabel(t.wait)} انتظار</span>}
          <span>{PERIODS[t.period]}</span>
          {t.routineId && <span title="من روتينك">↻</span>}
          {tracked >= 60_000 && !active && <span>سجلتي {minutesLabel(tracked / 60000)}</span>}
        </div>
        {t.notes && <p class="notes">{t.notes}</p>}
        {!isDone && (
          <div class="task-actions">
            {active ? (
              <button class="small primary" onClick={() => mutate((d) => stop(d))}>⏸ {stopwatch(now - db.active!.start)}</button>
            ) : (
              <button class="small soft" onClick={() => mutate((d) => start(d, t.id))}>▷ ابدئي</button>
            )}
            {t.wait > 0 && !waiting && <button class="small" onClick={() => mutate((d) => beginWait(d, t.id), 'بدأ الانتظار')}>بدأ الانتظار</button>}
            {waiting && <span class="small waiting">{waiting.end > now ? `مستنية ${stopwatch(waiting.end - now)}` : 'الانتظار خلص ✓'}</span>}
            <button class="small quiet" onClick={() => mutate((d) => move(d, t.id, addDays(t.date, 1)), 'اتنقلت لبكرة')}>لبكرة</button>
            <button class="small quiet" onClick={props.onMove} aria-label="نقل ليوم تاني">⋯</button>
          </div>
        )}
      </div>
    </li>
  );
}

function NotifyHint(props: { showToast: (m: string) => void }) {
  const [alarms, setAlarms] = useState<Awaited<ReturnType<typeof alarmStatus>> | null>(null);
  const supported = typeof Notification !== 'undefined';
  const [perm, setPerm] = useState(supported ? Notification.permission : 'denied');
  useEffect(() => { void alarmStatus().then(setAlarms); }, []);
  if (alarms === 'granted') return <p class="muted">هننبهك على الموبايل لما الوقت يخلص، حتى لو التطبيق مقفول.</p>;
  if (alarms === 'denied') return <p class="muted">التنبيهات مقفولة. فعّليها من إعدادات الموبايل عشان نقولك لما الوقت يخلص.</p>;
  if (alarms === 'ask') return <p class="muted">هنطلب إذن التنبيهات عشان نقولك لما الوقت يخلص.</p>;
  if (!supported || perm === 'granted') return <p class="muted">هننبهك هنا لما الوقت يخلص، طول ما يومي مفتوح.</p>;
  if (perm === 'denied') return <p class="muted">التنبيه هيظهر جوه يومي بس، طول ما الصفحة مفتوحة.</p>;
  return (
    <p class="muted">
      التنبيه بيشتغل طول ما يومي مفتوح.{' '}
      <button class="link" onClick={async () => {
        const p = await Notification.requestPermission();
        setPerm(p);
        if (p === 'granted') props.showToast('تمام، هننبهك');
      }}>فعّلي تنبيه الجهاز</button>
    </p>
  );
}

// ---------- routines ----------

export function RoutinesView(props: { db: DB; mutate: Mutate; now: number }) {
  const { db, mutate } = props;
  const today = todayKey(db.settings.zone, props.now);
  const [form, setForm] = useState<null | { id?: string; initial?: Partial<FormResult> }>(null);
  const upcoming = Array.from({ length: 7 }, (_, i) => addDays(today, i + 1))
    .map((d) => ({ d, items: routinePreview(db, d).length + dayTasks(db, d).filter((t) => t.routineId && t.status === 'todo').length }))
    .filter((x) => x.items > 0);

  const submit = (v: FormResult) =>
    form?.id
      ? mutate((d) => updateRoutine(d, form.id!, v, v.days ?? [], v.enabled ?? true), 'اتحفظ الروتين')
      : mutate((d) => {
          addRoutine(d, v, v.days ?? [], today);
          materialize(d, today);
        }, 'اتضاف الروتين');

  return (
    <>
      <div class="page-heading">
        <div>
          <span class="eyebrow">الحاجات اللي بتتكرر</span>
          <h1>روتينك، بطريقتك</h1>
          <p>اختاري الأيام، ويومي يضيف المهمة ليومها تلقائيًا.</p>
        </div>
        <button class="primary" onClick={() => setForm({ initial: { days: [] } })}><span class="plus">＋</span>روتين</button>
      </div>
      <div class="content-grid">
        <section class="card">
          {db.routines.length === 0 ? (
            <div class="empty">
              <div class="empty-icon">↻</div>
              <h3>قلّلي الحاجات اللي محتاجة تفتكريها</h3>
              <p class="muted">زي الغسيل يومين في الأسبوع، أو تجهيز الشنط بالليل. اختاري مثال وعدّلي أيامه.</p>
              <div class="templates">
                {TEMPLATES.map(({ emoji, ...tpl }) => (
                  <button class="template" onClick={() => setForm({ initial: { ...tpl, days: [] } })}>
                    <span class="emoji">{emoji}</span><strong>{tpl.title}</strong><span class="muted">{n(tpl.effort)} دقيقة مجهود</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <ul class="tasks">
              {db.routines.map((r) => (
                <li class={`task${r.enabled ? '' : ' paused'}`}>
                  <span class="task-check ghost" aria-hidden="true">↻</span>
                  <div class="task-body">
                    <button class="task-title" onClick={() => setForm({ id: r.id, initial: r })}>{r.title}</button>
                    <div class="meta">
                      <span class="tag">{CATEGORIES[r.category]}</span>
                      <span>{WEEK_ORDER.filter((d) => r.days.includes(d)).map((d) => WEEKDAYS[d]).join('، ')}</span>
                      <span>◷ {minutesLabel(r.effort)}</span>
                      {!r.enabled && <span>متوقف</span>}
                    </div>
                  </div>
                  <button class="small quiet" onClick={() => mutate((d) => updateRoutine(d, r.id, r, r.days, !r.enabled))}>{r.enabled ? 'إيقاف' : 'تشغيل'}</button>
                </li>
              ))}
            </ul>
          )}
          <p class="muted footnote">تعديل الروتين بيغيّر الأيام الجاية بس. مهام الأيام اللي اتضافت وسجلّك بيفضلوا زي ما هم. إيقاف التكرار مش بيمسح حاجة.</p>
        </section>
        <aside class="side">
          <section class="card">
            <div class="section-head"><h2>الأسبوع الجاي</h2></div>
            {upcoming.length === 0 ? <p class="muted">لسه مفيش روتين في الأيام الجاية.</p> : (
              <ul class="upcoming">
                {upcoming.map(({ d, items }) => <li><span>{weekdayName(d)} {dayNumber(d)}</span><strong>{n(items)} من روتينك</strong></li>)}
              </ul>
            )}
          </section>
        </aside>
      </div>
      {form && (
        <TaskForm routine title={form.id ? 'تعديل الروتين' : 'روتين جديد'} submitLabel={form.id ? 'حفظ' : 'إضافة'}
          initial={form.initial} onSubmit={submit} onClose={() => setForm(null)}
          onDelete={form.id ? () => mutate((d) => deleteRoutine(d, form.id!), 'اتشال الروتين').then(() => setForm(null)) : undefined} />
      )}
    </>
  );
}

// ---------- history / log ----------

export function HistoryView(props: { db: DB; mutate: Mutate; date: DayKey; setDate: (d: DayKey) => void; now: number }) {
  const { db, mutate, date, now } = props;
  const today = todayKey(db.settings.zone, now);
  const [adjusting, setAdjusting] = useState<Task | null>(null);
  const tasks = dayTasks(db, date);
  const done = tasks.filter((t) => t.status === 'done');
  const open = tasks.filter((t) => t.status === 'todo');
  const trackedDay = trackedOnDay(db, date, now) / 60000;
  const perTaskOnDay = (t: Task) => {
    const one: DB = { ...db, sessions: db.sessions.filter((s) => s.taskId === t.id), adjustments: db.adjustments.filter((a) => a.taskId === t.id), active: db.active?.taskId === t.id ? db.active : null };
    return trackedOnDay(one, date, now) / 60000;
  };
  return (
    <>
      <div class="page-heading">
        <div>
          <span class="eyebrow">نظرة هادية على اليوم</span>
          <h1>كل حاجة عملتيها بتفرق</h1>
          <p>الوقت للمساعدة في التخطيط، مش لتقييم يومك.</p>
        </div>
      </div>
      <WeekStrip db={db} date={date} today={today} onPick={props.setDate} />
      <div class="stats">
        <div class="card stat"><strong>{n(done.length)}</strong><span>حاجات خلصت</span></div>
        <div class="card stat"><strong>{n(Math.round(trackedDay))}</strong><span>دقيقة مجهود مسجلة</span></div>
        <div class="card stat"><strong>{n(open.length)}</strong><span>لسه في القائمة</span></div>
      </div>
      <section class="card">
        {tasks.length === 0 ? <p class="muted">مفيش حاجات في اليوم ده.</p> : (
          <ul class="tasks">
            {tasks.map((t) => {
              const m = perTaskOnDay(t);
              return (
                <li class={`task${t.status === 'done' ? ' done' : ''}`}>
                  <span class={`task-check${t.status === 'done' ? ' done' : ''}`} aria-hidden="true">{t.status === 'done' ? '✓' : ''}</span>
                  <div class="task-body">
                    <div class="task-title">{t.title}</div>
                    <div class="meta"><span>المتوقع {minutesLabel(t.effort)}</span><span>المسجل في اليوم ده {minutesLabel(m)}</span></div>
                  </div>
                  <button class="small quiet" onClick={() => setAdjusting(t)}>ضبط الوقت</button>
                </li>
              );
            })}
          </ul>
        )}
        <p class="muted footnote">مهام الروتين بتتضاف لما يومها ييجي. عدد المهام مش مقياس ليومك، ومفيش رصد تلقائي لنشاطك.</p>
      </section>
      {adjusting && (
        <AdjustModal task={adjusting} day={date} trackedMin={perTaskOnDay(adjusting)} onClose={() => setAdjusting(null)}
          onSubmit={(delta) => mutate((d) => adjustTime(d, adjusting.id, date, delta), 'اتظبط الوقت')} />
      )}
    </>
  );
}
