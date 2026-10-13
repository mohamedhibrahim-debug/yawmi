import type { DayKey } from '../domain/time';
import { weekday } from '../domain/time';

const nf = new Intl.NumberFormat('ar-EG', { useGrouping: false });
export const n = (v: number) => nf.format(v);

export const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
/** Egyptian week order starting Saturday. */
export const WEEK_ORDER = [6, 0, 1, 2, 3, 4, 5];

export function minutesLabel(min: number): string {
  const m = Math.round(min);
  if (m < 60) return `${n(m)} د`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${n(h)} س ${n(r)} د` : `${n(h)} س`;
}

/** "9:05 ص" from minutes after midnight. */
export function clockLabel(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60);
  const mm = m % 60;
  const suffix = h24 < 12 ? 'ص' : 'م';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${n(h12)}:${n(mm).padStart(2, n(0))} ${suffix}`;
}

/** "١٢:٣٤" countdown / stopwatch from ms. */
export function stopwatch(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const two = (v: number) => n(v).padStart(2, n(0));
  return h ? `${n(h)}:${two(m)}:${two(s)}` : `${two(m)}:${two(s)}`;
}

export function dayNumber(key: DayKey): string {
  return n(Number(key.slice(8, 10)));
}

export function weekdayName(key: DayKey): string {
  return WEEKDAYS[weekday(key)];
}

const longFmt = new Intl.DateTimeFormat('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
export function longDate(key: DayKey): string {
  const [y, m, d] = key.split('-').map(Number);
  return longFmt.format(new Date(Date.UTC(y, m - 1, d)));
}

/** Saturday that starts the week containing `key`. */
export function weekStart(key: DayKey, addDaysFn: (k: DayKey, n: number) => DayKey): DayKey {
  const back = (weekday(key) + 1) % 7; // Saturday → 0
  return addDaysFn(key, -back);
}
