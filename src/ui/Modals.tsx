import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { CATEGORIES, LIMITS, PERIODS, type Category, type DB, type Period, type Task, type TaskFields } from '../domain/model';
import { dayTasks, plan, plannedEffort } from '../domain/ops';
import { exportEnvelope, exportFileName, parseBackup } from '../domain/io';
import { addDays, isDayKey, isValidZone, minutesOfDay, todayKey, type DayKey } from '../domain/time';
import type { PersistState } from '../storage/store';
import { clockLabel, longDate, minutesLabel, n, WEEKDAYS, WEEK_ORDER } from './format';

// ---------- base modal ----------

export function Modal(props: { title: string; onClose: () => void; children: ComponentChildren; wide?: boolean; sheet?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    // Esc and backdrop both close through onClose.
    const onCancel = (e: Event) => {
      e.preventDefault();
      props.onClose();
    };
    d?.addEventListener('cancel', onCancel);
    return () => d?.removeEventListener('cancel', onCancel);
  }, []);
  return (
    <dialog ref={ref} class={`modal${props.wide ? ' wide' : ''}${props.sheet ? ' sheet' : ''}`} aria-labelledby="modal-title"
      onClick={(e) => { if (e.target === ref.current) props.onClose(); }}>
      <div class="modal-inner">
        <div class="modal-head">
          <h2 id="modal-title">{props.title}</h2>
          <button class="icon-button" aria-label="إغلاق" onClick={props.onClose}>×</button>
        </div>
        {props.children}
      </div>
    </dialog>
  );
}

// ---------- task / routine form ----------

export interface FormResult extends TaskFields {
  days?: number[];
  enabled?: boolean;
}

export function TaskForm(props: {
  title: string;
  initial?: Partial<FormResult>;
  routine?: boolean;
  submitLabel: string;
  onSubmit: (v: FormResult) => Promise<boolean>;
  onClose: () => void;
  onDelete?: () => void;
}) {
  const i = props.initial ?? {};
  const [title, setTitle] = useState(i.title ?? '');
  const [effort, setEffort] = useState(String(i.effort ?? 15));
  const [category, setCategory] = useState<Category>(i.category ?? 'home');
  const [period, setPeriod] = useState<Period>(i.period ?? 'morning');
  const [priority, setPriority] = useState(!!i.priority);
  const [wait, setWait] = useState(String(i.wait ?? 0));
  const [notes, setNotes] = useState(i.notes ?? '');
  const [days, setDays] = useState<number[]>(i.days ?? []);
  const [enabled, setEnabled] = useState(i.enabled ?? true);
  const [busy, setBusy] = useState(false);

  const submit = async (e: Event) => {
    e.preventDefault();
    setBusy(true);
    const ok = await props.onSubmit({
      title, effort: Number(effort), category, period, priority, wait: Number(wait) || 0, notes,
      ...(props.routine ? { days, enabled } : {})
    });
    setBusy(false);
    if (ok) props.onClose();
  };

  return (
    <Modal title={props.title} onClose={props.onClose}>
      <form class="form" onSubmit={submit}>
        <label>اسم الحاجة
          <input value={title} maxLength={LIMITS.title} required autoFocus onInput={(e) => setTitle(e.currentTarget.value)} placeholder="مثلًا: تنضيف المطبخ" />
        </label>
        <div class="row2">
          <label>وقت مجهودك بالدقائق
            <input type="number" inputMode="numeric" min={LIMITS.effortMin} max={LIMITS.effortMax} required value={effort} onInput={(e) => setEffort(e.currentTarget.value)} />
          </label>
          <label>القسم
            <select value={category} onChange={(e) => setCategory(e.currentTarget.value as Category)}>
              {Object.entries(CATEGORIES).map(([k, v]) => <option value={k}>{v}</option>)}
            </select>
          </label>
        </div>
        <fieldset class="seg">
          <legend>أنسب وقت</legend>
          {Object.entries(PERIODS).map(([k, v]) => (
            <label class={period === k ? 'on' : ''}>
              <input type="radio" name="period" value={k} checked={period === k} onChange={() => setPeriod(k as Period)} />{v}
            </label>
          ))}
        </fieldset>
        {props.routine && (
          <fieldset class="seg days">
            <legend>الأيام</legend>
            {WEEK_ORDER.map((d) => (
              <label class={days.includes(d) ? 'on' : ''}>
                <input type="checkbox" checked={days.includes(d)}
                  onChange={() => setDays(days.includes(d) ? days.filter((x) => x !== d) : [...days, d])} />
                {WEEKDAYS[d]}
              </label>
            ))}
          </fieldset>
        )}
        <label class="check"><input type="checkbox" checked={priority} onChange={(e) => setPriority(e.currentTarget.checked)} /> مهمة بالنسبة ليومك</label>
        <details open={Number(wait) > 0 || !!notes}>
          <summary>وقت انتظار وملاحظات</summary>
          <label>انتظار بعدها بالدقائق
            <input type="number" inputMode="numeric" min={0} max={LIMITS.waitMax} value={wait} onInput={(e) => setWait(e.currentTarget.value)} />
          </label>
          <p class="muted">زي دورة الغسالة. مش محسوب من وقت مجهودك، وممكن تعملي حاجة تانية في الوقت ده.</p>
          <label>ملاحظات
            <textarea rows={3} maxLength={LIMITS.notes} value={notes} onInput={(e) => setNotes(e.currentTarget.value)} />
          </label>
        </details>
        {props.routine && i.days && (
          <label class="check"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.currentTarget.checked)} /> التكرار شغال</label>
        )}
        <div class="actions">
          {props.onDelete && <button type="button" class="quiet danger" onClick={props.onDelete}>حذف</button>}
          <span class="grow" />
          <button type="button" class="quiet" onClick={props.onClose}>إلغاء</button>
          <button class="primary" disabled={busy}>{props.submitLabel}</button>
        </div>
      </form>
    </Modal>
  );
}

// ---------- plan ("arrange my day") ----------

export function PlanModal(props: { db: DB; date: DayKey; now: number; onClose: () => void }) {
  const { db, date } = props;
  const isToday = date === todayKey(db.settings.zone, props.now);
  const rows = plan(db, date, isToday ? minutesOfDay(props.now, db.settings.zone) : undefined);
  const byId = new Map(dayTasks(db, date).map((t) => [t.id, t]));
  const total = plannedEffort(db, date);
  const overAny = rows.some((r) => r.over);
  return (
    <Modal title="ترتيب مقترح ليومك" onClose={props.onClose} wide>
      <p class="muted">{longDate(date)} · ترتيب مقترح بس، غيّري فيه براحتك. بين كل حاجة والتانية {n(10)} دقايق راحة.</p>
      {rows.length === 0 ? <p>مفيش حاجات مستنية النهارده. يوم هادي ☼</p> : (
        <ol class="plan">
          {rows.map((r) => {
            const t = byId.get(r.id)!;
            return (
              <li class={r.over ? 'over' : ''}>
                <span class="plan-time">{clockLabel(r.start)} – {clockLabel(r.end)}</span>
                <span class="plan-title">{t.title}{t.priority && <span class="star" title="مهمة">★</span>}</span>
                {t.wait > 0 && <span class="muted">جاهزة حوالي {clockLabel(r.ready)}</span>}
                {r.over && <span class="over-note">فوق الوقت المتاح</span>}
              </li>
            );
          })}
        </ol>
      )}
      <p class={overAny ? 'note warn' : 'note'}>
        {n(total)} دقيقة مجهود من {n(db.settings.capacity)} متاحة.
        {overAny ? ' اليوم مليان. ممكن تأجلي حاجة لبكرة من غير ما تحسي بذنب.' : ' فاضل لك وقت ليكي.'}
      </p>
    </Modal>
  );
}

// ---------- onboarding ----------

export function Onboarding(props: { db: DB; onSave: (s: Partial<DB['settings']>) => Promise<boolean>; onClose: () => void }) {
  const s = props.db.settings;
  const [name, setName] = useState(s.name);
  const [capacity, setCapacity] = useState(String(s.capacity));
  const [start, setStart] = useState(s.start);
  const submit = async (e: Event) => {
    e.preventDefault();
    await props.onSave({ name: name.trim(), capacity: Number(capacity), start });
  };
  return (
    <Modal title="أهلًا بيكي في يومي" onClose={props.onClose}>
      <form class="form" onSubmit={submit}>
        <p class="muted">هنرتّب حاجات البيت بهدوء. كل الأوقات قابلة للتغيير، والتسجيل اختياري.</p>
        <label>نقولك إيه؟ (اختياري)
          <input value={name} maxLength={LIMITS.name} placeholder="اسمك" onInput={(e) => setName(e.currentTarget.value)} />
        </label>
        <div class="row2">
          <label>وقت المجهود المتاح لباقي اليوم (دقيقة)
            <input type="number" inputMode="numeric" min={LIMITS.capacityMin} max={LIMITS.capacityMax} required value={capacity} onInput={(e) => setCapacity(e.currentTarget.value)} />
          </label>
          <label>بداية ترتيب المهام
            <input type="time" required value={start} onInput={(e) => setStart(e.currentTarget.value)} />
          </label>
        </div>
        <p class="muted">وقت تقديري على قد ظروفك، من غير انتظار الغسالة أو فترات الراحة. عدّليه لما ظروف اليوم تتغيّر.</p>
        <div class="actions"><span class="grow" /><button class="primary">نبدأ يومنا</button></div>
      </form>
    </Modal>
  );
}

// ---------- settings, backup, restore ----------

export function SettingsModal(props: {
  db: DB;
  persist: PersistState | null;
  onSave: (s: Partial<DB['settings']>) => Promise<boolean>;
  onImport: (db: DB) => Promise<void>;
  onClose: () => void;
}) {
  const s = props.db.settings;
  const [name, setName] = useState(s.name);
  const [capacity, setCapacity] = useState(String(s.capacity));
  const [start, setStart] = useState(s.start);
  const [zone, setZone] = useState(s.zone);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, setPending] = useState<DB | null>(null);
  const zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [s.zone];

  const save = async (e: Event) => {
    e.preventDefault();
    if (!isValidZone(zone)) return setMsg('المنطقة الزمنية مش صحيحة');
    if (await props.onSave({ name: name.trim(), capacity: Number(capacity), start, zone })) props.onClose();
  };

  const download = () => {
    const blob = new Blob([JSON.stringify(exportEnvelope(props.db), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = exportFileName();
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    setMsg('اتحفظت نسخة على جهازك. خليها في مكان آمن زي الإيميل أو درايف.');
  };

  const pick = async (e: Event) => {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    (e.currentTarget as HTMLInputElement).value = '';
    if (!file) return;
    try {
      setPending(parseBackup(await file.text(), s.zone));
      setMsg(null);
    } catch (err) {
      setPending(null);
      setMsg(err instanceof Error ? err.message : 'الملف مش مقروء');
    }
  };

  const confirmImport = async () => {
    if (!pending) return;
    pending.settings.onboarded = true;
    await props.onImport(pending);
    setPending(null);
    props.onClose();
  };

  const persistText = {
    persisted: 'المتصفح وعد يحتفظ ببياناتك. برضه اعملي نسخة احتياطية من وقت للتاني.',
    'best-effort': 'المتصفح ممكن يمسح البيانات لو المساحة قلت. اعملي نسخة احتياطية بانتظام، وثبّتي يومي على الشاشة الرئيسية.',
    unsupported: 'مش عارفين نضمن حفظ البيانات على المتصفح ده. اعملي نسخة احتياطية بانتظام.'
  } as const;

  return (
    <Modal title="الإعدادات والنسخ الاحتياطي" onClose={props.onClose} wide>
      <form class="form" onSubmit={save}>
        <div class="row2">
          <label>الاسم
            <input value={name} maxLength={LIMITS.name} onInput={(e) => setName(e.currentTarget.value)} />
          </label>
          <label>الوقت المتاح للمجهود (دقيقة)
            <input type="number" inputMode="numeric" min={LIMITS.capacityMin} max={LIMITS.capacityMax} required value={capacity} onInput={(e) => setCapacity(e.currentTarget.value)} />
          </label>
        </div>
        <div class="row2">
          <label>بداية ترتيب المهام
            <input type="time" required value={start} onInput={(e) => setStart(e.currentTarget.value)} />
          </label>
          <label>المنطقة الزمنية لأيامك
            <input list="zones" value={zone} dir="ltr" onInput={(e) => setZone(e.currentTarget.value)} />
            <datalist id="zones">{zones.map((z) => <option value={z} />)}</datalist>
          </label>
        </div>
        <div class="actions"><span class="grow" /><button class="primary">حفظ</button></div>
      </form>

      <hr />
      <h3>بياناتك</h3>
      <p class="muted">كل حاجة متخزنة على الجهاز ده بس. {props.persist ? persistText[props.persist] : ''}</p>
      <div class="actions wrap">
        <button type="button" onClick={download}>⇩ نسخة احتياطية</button>
        <label class="button">⇧ استرجاع من ملف
          <input type="file" accept="application/json,.json" class="visually-hidden" onChange={pick} />
        </label>
      </div>
      <p class="muted">بتقبل ملفات يومي، ومنها ملف النسخة التجريبية القديمة.</p>
      {pending && (
        <div class="note warn" role="alert">
          <p>الملف فيه {n(pending.tasks.filter((t) => t.status !== 'deleted').length)} مهمة و{n(pending.routines.length)} روتين. الاسترجاع هيستبدل كل البيانات الحالية على الجهاز ده.</p>
          <div class="actions"><button type="button" class="quiet" onClick={() => setPending(null)}>إلغاء</button><button type="button" class="primary" onClick={confirmImport}>استبدال واسترجاع</button></div>
        </div>
      )}
      {msg && <p class="note" role="status">{msg}</p>}
    </Modal>
  );
}

// ---------- manual time adjustment ----------

export function AdjustModal(props: { task: Task; day: DayKey; trackedMin: number; onSubmit: (delta: number) => Promise<boolean>; onClose: () => void }) {
  const [minutes, setMinutes] = useState(String(Math.round(props.trackedMin)));
  const submit = async (e: Event) => {
    e.preventDefault();
    const delta = Number(minutes) - Math.round(props.trackedMin);
    if (delta === 0) return props.onClose();
    if (await props.onSubmit(delta)) props.onClose();
  };
  return (
    <Modal title="ضبط الوقت" onClose={props.onClose}>
      <form class="form" onSubmit={submit}>
        <p><strong>{props.task.title}</strong> · {longDate(props.day)}</p>
        <label>الوقت الفعلي في اليوم ده (دقيقة)
          <input type="number" inputMode="numeric" min={0} max={LIMITS.adjustMax} required autoFocus value={minutes} onInput={(e) => setMinutes(e.currentTarget.value)} />
        </label>
        <p class="muted">المسجل حاليًا {minutesLabel(props.trackedMin)}. التعديل بيتسجل لوحده ومش بيمسح الجلسات.</p>
        <div class="actions"><span class="grow" /><button type="button" class="quiet" onClick={props.onClose}>إلغاء</button><button class="primary">حفظ</button></div>
      </form>
    </Modal>
  );
}

// ---------- move to another day ----------

export function MoveModal(props: { task: Task; zone: string; onSubmit: (date: DayKey) => Promise<boolean>; onClose: () => void }) {
  const [date, setDate] = useState(addDays(props.task.date, 1));
  const submit = async (e: Event) => {
    e.preventDefault();
    if (isDayKey(date) && (await props.onSubmit(date))) props.onClose();
  };
  return (
    <Modal title="نقل لِيوم تاني" onClose={props.onClose}>
      <form class="form" onSubmit={submit}>
        <p><strong>{props.task.title}</strong></p>
        <label>اليوم الجديد
          <input type="date" required value={date} min={todayKey(props.zone)} onInput={(e) => setDate(e.currentTarget.value)} />
        </label>
        <div class="actions"><span class="grow" /><button type="button" class="quiet" onClick={props.onClose}>إلغاء</button><button class="primary">نقل</button></div>
      </form>
    </Modal>
  );
}
