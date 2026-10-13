// Calendar and time-zone helpers.
// Day keys are plain calendar dates ("YYYY-MM-DD") in the user's planner zone.
// Calendar arithmetic is done in UTC so it never depends on the device zone or DST.

export type DayKey = string;

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isDayKey(s: unknown): s is DayKey {
  if (typeof s !== 'string') return false;
  const m = DAY_RE.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 2000 || y > 2100 || mo < 1 || mo > 12 || d < 1) return false;
  return d <= daysInMonth(y, mo);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function parts(key: DayKey): [number, number, number] {
  const m = DAY_RE.exec(key);
  if (!m) throw new Error(`invalid day key: ${key}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function fromUTC(ms: number): DayKey {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export function addDays(key: DayKey, n: number): DayKey {
  const [y, m, d] = parts(key);
  return fromUTC(Date.UTC(y, m - 1, d + n));
}

/** 0 = Sunday … 6 = Saturday, same convention as Date#getDay. */
export function weekday(key: DayKey): number {
  const [y, m, d] = parts(key);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function isValidZone(zone: unknown): zone is string {
  if (typeof zone !== 'string' || zone.length === 0 || zone.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

export function deviceZone(): string {
  try {
    const z = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidZone(z) ? z : 'UTC';
  } catch {
    return 'UTC';
  }
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function zoneFormatter(zone: string): Intl.DateTimeFormat {
  let f = fmtCache.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    fmtCache.set(zone, f);
  }
  return f;
}

/** Wall-clock fields of an instant in a zone. */
export function zonedParts(ms: number, zone: string) {
  const out: Record<string, number> = {};
  for (const p of zoneFormatter(zone).formatToParts(new Date(ms))) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return {
    year: out.year,
    month: out.month,
    day: out.day,
    hour: out.hour === 24 ? 0 : out.hour,
    minute: out.minute,
    second: out.second
  };
}

/** The calendar day an instant falls on, in the given zone. */
export function dayKeyAt(ms: number, zone: string): DayKey {
  const p = zonedParts(ms, zone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Offset of the zone from UTC at an instant, in ms (positive east of UTC). */
export function zoneOffset(ms: number, zone: string): number {
  const p = zonedParts(ms, zone);
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUTC - Math.floor(ms / 1000) * 1000;
}

/**
 * First instant of a calendar day in a zone. Handles DST gaps at midnight
 * (Egypt has switched clocks at 00:00): if 00:00 does not exist, the day
 * starts at the first instant that does.
 */
export function startOfDay(key: DayKey, zone: string): number {
  const [y, m, d] = parts(key);
  const wall = Date.UTC(y, m - 1, d);
  let t = wall - zoneOffset(wall, zone);
  t = wall - zoneOffset(t, zone);
  // If we landed on the previous day (gap at midnight), step forward to the day.
  if (dayKeyAt(t, zone) !== key) {
    for (let probe = t; probe < t + 3 * 3600_000; probe += 60_000) {
      if (dayKeyAt(probe, zone) === key) return probe;
    }
  }
  // If an earlier instant still belongs to the same day (overlap), walk back.
  while (dayKeyAt(t - 60_000, zone) === key) t -= 60_000;
  return t;
}

export function todayKey(zone: string, now = Date.now()): DayKey {
  return dayKeyAt(now, zone);
}

/** Minutes since local midnight, in the zone. */
export function minutesOfDay(ms: number, zone: string): number {
  const p = zonedParts(ms, zone);
  return p.hour * 60 + p.minute;
}
