import type { DayKey } from './time';
import { deviceZone } from './time';

export const SCHEMA_VERSION = 2;

export const CATEGORIES = {
  home: 'البيت',
  food: 'الأكل',
  kids: 'الأولاد',
  self: 'وقت لنفسي',
  other: 'حاجة تانية'
} as const;
export type Category = keyof typeof CATEGORIES;

export const PERIODS = {
  morning: 'الصبح',
  afternoon: 'بعد الضهر',
  evening: 'بالليل'
} as const;
export type Period = keyof typeof PERIODS;
export const PERIOD_ORDER: Period[] = ['morning', 'afternoon', 'evening'];
/** Earliest start (minutes after midnight) for each period when arranging the day. */
export const PERIOD_FLOOR: Record<Period, number> = { morning: 0, afternoon: 12 * 60, evening: 17 * 60 };

export const LIMITS = {
  title: 120,
  notes: 1000,
  name: 40,
  effortMin: 1,
  effortMax: 480,
  waitMax: 720,
  capacityMin: 15,
  capacityMax: 960,
  adjustMax: 24 * 60
} as const;

export interface TaskFields {
  title: string;
  category: Category;
  effort: number;
  wait: number;
  priority: boolean;
  period: Period;
  notes: string;
}

export interface Task extends TaskFields {
  id: string;
  date: DayKey;
  originalDate: DayKey;
  routineId: string | null;
  status: 'todo' | 'done' | 'deleted';
  completedAt: number | null;
  order: number;
}

export interface Routine extends TaskFields {
  id: string;
  enabled: boolean;
  start: DayKey;
  /** 0 = Sunday … 6 = Saturday */
  days: number[];
}

export interface Session {
  id: string;
  taskId: string;
  start: number;
  end: number;
}

/** Manual correction of tracked time, attributed to one day. */
export interface Adjustment {
  id: string;
  taskId: string;
  day: DayKey;
  deltaMinutes: number;
}

export interface Wait {
  taskId: string;
  start: number;
  end: number;
}

export interface Settings {
  name: string;
  capacity: number;
  start: string; // HH:mm
  onboarded: boolean;
  zone: string; // IANA planner zone
}

export interface DB {
  version: number;
  revision: number;
  settings: Settings;
  tasks: Task[];
  routines: Routine[];
  sessions: Session[];
  adjustments: Adjustment[];
  waits: Wait[];
  active: { taskId: string; start: number } | null;
}

export function freshDB(zone = deviceZone()): DB {
  return {
    version: SCHEMA_VERSION,
    revision: 0,
    settings: { name: '', capacity: 180, start: '09:00', onboarded: false, zone },
    tasks: [],
    routines: [],
    sessions: [],
    adjustments: [],
    waits: [],
    active: null
  };
}

export function uid(): string {
  return globalThis.crypto.randomUUID();
}

export interface Template extends TaskFields {
  emoji: string;
}

export const TEMPLATES: Template[] = [
  { emoji: '🧺', title: 'تشغيل الغسالة', category: 'home', effort: 10, wait: 50, priority: false, period: 'morning', notes: '' },
  { emoji: '🥗', title: 'تحضير الغدا', category: 'food', effort: 45, wait: 0, priority: true, period: 'afternoon', notes: '' },
  { emoji: '📚', title: 'مذاكرة مع الأولاد', category: 'kids', effort: 40, wait: 0, priority: false, period: 'evening', notes: '' },
  { emoji: '☕', title: 'وقت لنفسي', category: 'self', effort: 20, wait: 0, priority: false, period: 'afternoon', notes: '' }
];
