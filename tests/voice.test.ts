import { describe, expect, it } from 'vitest';
import { dayOffset, parseSpeech } from '../src/domain/voice';

describe('voice parsing (Egyptian Arabic)', () => {
  it('splits a natural sentence into tasks with periods and keyword defaults', () => {
    const d = parseSpeech('عايزة أشغل الغسالة وأطبخ الغدا بعد الضهر وأذاكر للولاد بالليل ساعة');
    expect(d.map((x) => x.title)).toEqual(['أشغل الغسالة', 'أطبخ الغدا', 'أذاكر للولاد']);
    expect(d[0]).toMatchObject({ category: 'home', effort: 10, wait: 50, period: 'morning' });
    expect(d[0].guessed.wait).toBe(true);
    expect(d[1]).toMatchObject({ category: 'food', period: 'afternoon' });
    expect(d[1].guessed.period).toBe(false);
    expect(d[2]).toMatchObject({ category: 'kids', effort: 60, period: 'evening' });
    expect(d[2].guessed.effort).toBe(false);
  });

  it('applies "tomorrow" and the period to following tasks, and reads priority', () => {
    const d = parseSpeech('بكرة الصبح تنضيف الحمام نص ساعة، وكمان اشتري طلبات البيت مهم');
    expect(d).toHaveLength(2);
    expect(d[0]).toMatchObject({ title: 'تنضيف الحمام', effort: 30, period: 'morning', day: { kind: 'offset', days: 1 } });
    expect(d[1]).toMatchObject({ title: 'اشتري طلبات البيت', priority: true, period: 'morning', day: { kind: 'offset', days: 1 } });
  });

  it('attaches a spoken waiting time to the task before it', () => {
    const d = parseSpeech('أعجن العجين عشر دقايق وبعدين يستنى ساعة ونص');
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ effort: 10, wait: 90, category: 'food' });
    expect(d[0].guessed.wait).toBe(false);
  });

  it('reads waiting time inside the same phrase', () => {
    const d = parseSpeech('أشغل الغسالة خمس دقايق وتستنى خمسة وأربعين دقيقة');
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ effort: 5, wait: 45 });
  });

  it('understands Arabic-Indic digits and hour expressions', () => {
    expect(parseSpeech('تنضيف المطبخ ٢٠ دقيقة')[0]).toMatchObject({ title: 'تنضيف المطبخ', effort: 20 });
    expect(parseSpeech('ترويق الشقة ساعتين')[0].effort).toBe(120);
    expect(parseSpeech('كوي الهدوم ساعة إلا ربع')[0].effort).toBe(45);
    expect(parseSpeech('مسح الأرض ربع ساعة')[0].effort).toBe(15);
  });

  it('does not split on "and" before a noun with the definite article', () => {
    const d = parseSpeech('مذاكرة مع الولاد والبنات ساعة');
    expect(d).toHaveLength(1);
    expect(d[0].title).toBe('مذاكرة مع الولاد والبنات');
  });

  it('reads a weekday and resolves it to the next occurrence', () => {
    const d = parseSpeech('يوم الخميس أروح السوق');
    expect(d[0]).toMatchObject({ title: 'أروح السوق', day: { kind: 'weekday', day: 4 }, category: 'other' });
    expect(dayOffset(d[0].day, 2)).toBe(2); // Tuesday → Thursday
    expect(dayOffset({ kind: 'weekday', day: 2 }, 2)).toBe(0);
  });

  it('reads keywords with a glued «و» («وبكرة الصبح»)', () => {
    const d = parseSpeech('عايزة أشغل الغسالة وأطبخ الغدا بعد الضهر، وبكرة الصبح أنضف الحمام نص ساعة مهم');
    expect(d).toHaveLength(3);
    expect(d[2]).toMatchObject({ title: 'أنضف الحمام', day: { kind: 'offset', days: 1 }, period: 'morning', effort: 30, priority: true });
    expect(d[0].day).toEqual({ kind: 'offset', days: 0 });
  });

  it('returns nothing for empty or filler-only speech', () => {
    expect(parseSpeech('')).toEqual([]);
    expect(parseSpeech('عايزة يعني')).toEqual([]);
  });
});
