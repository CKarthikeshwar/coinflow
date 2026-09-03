import {
  dayIndex,
  endOfLocalDayExclusive,
  isoWeekPeriod,
  monthPeriod,
  previousPeriod,
  startOfLocalDay,
  stepPeriod,
} from './period';

describe('startOfLocalDay / endOfLocalDayExclusive', () => {
  it('gives device-zone midnight for the day containing ts, and the next midnight exclusive', () => {
    const ts = new Date(2026, 8, 15, 14, 30).getTime(); // 15 Sep 2026, 14:30
    expect(new Date(startOfLocalDay(ts))).toEqual(new Date(2026, 8, 15, 0, 0, 0, 0));
    expect(new Date(endOfLocalDayExclusive(ts))).toEqual(new Date(2026, 8, 16, 0, 0, 0, 0));
  });
});

describe('dayIndex', () => {
  it('is the same integer for two timestamps on the same local day', () => {
    const morning = new Date(2026, 8, 15, 1, 0).getTime();
    const night = new Date(2026, 8, 15, 23, 59).getTime();
    expect(dayIndex(morning)).toBe(dayIndex(night));
  });

  it('increments by exactly 1 across a local midnight', () => {
    const day1 = new Date(2026, 8, 15, 12, 0).getTime();
    const day2 = new Date(2026, 8, 16, 12, 0).getTime();
    expect(dayIndex(day2)).toBe(dayIndex(day1) + 1);
  });
});

describe('monthPeriod', () => {
  it('spans exactly one calendar month in the local zone, mode "month"', () => {
    const anchor = new Date(2026, 8, 15, 10, 30).getTime(); // 15 Sep 2026
    const p = monthPeriod(anchor);
    expect(p.mode).toBe('month');
    expect(new Date(p.startMs)).toEqual(new Date(2026, 8, 1, 0, 0, 0, 0));
    expect(new Date(p.endMsExclusive)).toEqual(new Date(2026, 9, 1, 0, 0, 0, 0));
  });

  it('rolls the year over at December', () => {
    const anchor = new Date(2026, 11, 25).getTime(); // 25 Dec 2026
    const p = monthPeriod(anchor);
    expect(new Date(p.startMs)).toEqual(new Date(2026, 11, 1));
    expect(new Date(p.endMsExclusive)).toEqual(new Date(2027, 0, 1));
  });

  it('labels the current year with just the month name', () => {
    const now = Date.now();
    const p = monthPeriod(now);
    expect(p.label).not.toMatch(/\d{4}/);
  });

  it('labels a different year with the abbreviated month + year', () => {
    const p = monthPeriod(new Date(2020, 2, 10).getTime()); // Mar 2020 — not the current year
    expect(p.label).toBe('Mar 2020');
  });
});

describe('isoWeekPeriod', () => {
  it('spans Monday through the following Monday (exclusive), mode "week"', () => {
    // 16 Sep 2026 is a Wednesday.
    const anchor = new Date(2026, 8, 16, 9, 0).getTime();
    const p = isoWeekPeriod(anchor);
    expect(p.mode).toBe('week');
    expect(new Date(p.startMs)).toEqual(new Date(2026, 8, 14, 0, 0, 0, 0)); // Monday
    expect(new Date(p.endMsExclusive)).toEqual(new Date(2026, 8, 21, 0, 0, 0, 0)); // next Monday
  });

  it('labels as "D MMM – D MMM"', () => {
    const anchor = new Date(2026, 8, 16).getTime();
    const p = isoWeekPeriod(anchor);
    expect(p.label).toBe('14 Sep – 20 Sep');
  });
});

describe('previousPeriod', () => {
  it('month mode: the calendar month immediately before, with no gap or overlap', () => {
    const p = monthPeriod(new Date(2026, 8, 15).getTime());
    const prev = previousPeriod(p);
    expect(prev.mode).toBe('month');
    expect(new Date(prev.startMs)).toEqual(new Date(2026, 7, 1));
    expect(prev.endMsExclusive).toBe(p.startMs);
  });

  it('month mode: rolls back across a year boundary from January', () => {
    const p = monthPeriod(new Date(2027, 0, 10).getTime());
    const prev = previousPeriod(p);
    expect(new Date(prev.startMs)).toEqual(new Date(2026, 11, 1));
    expect(prev.endMsExclusive).toBe(p.startMs);
  });

  it('week mode: the ISO week immediately before, with no gap or overlap', () => {
    const p = isoWeekPeriod(new Date(2026, 8, 16).getTime());
    const prev = previousPeriod(p);
    expect(prev.mode).toBe('week');
    expect(prev.endMsExclusive).toBe(p.startMs);
    expect(new Date(prev.startMs)).toEqual(new Date(2026, 8, 7)); // the Monday before
  });
});

describe('stepPeriod', () => {
  it('month mode: dir -1 goes to the previous month', () => {
    const p = monthPeriod(new Date(2026, 8, 15).getTime());
    const stepped = stepPeriod(p, -1);
    expect(new Date(stepped.startMs)).toEqual(new Date(2026, 7, 1));
  });

  it('week mode: dir -1 goes to the previous ISO week', () => {
    const p = isoWeekPeriod(new Date(2026, 8, 16).getTime());
    const stepped = stepPeriod(p, -1);
    expect(new Date(stepped.startMs)).toEqual(new Date(2026, 8, 7));
  });

  it('dir +1 is a no-op ("next" disabled) once the next period would start in the future', () => {
    const current = monthPeriod(Date.now());
    const stepped = stepPeriod(current, 1);
    expect(stepped).toEqual(current);
  });

  it('dir +1 steps forward normally from a past period', () => {
    const past = monthPeriod(new Date(2020, 2, 10).getTime());
    const stepped = stepPeriod(past, 1);
    expect(new Date(stepped.startMs)).toEqual(new Date(2020, 3, 1));
  });
});
