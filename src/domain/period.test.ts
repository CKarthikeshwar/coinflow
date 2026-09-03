import { monthPeriod, previousMonthPeriod } from './period';

describe('monthPeriod', () => {
  it('spans exactly one calendar month in the local zone', () => {
    const anchor = new Date(2026, 8, 15, 10, 30).getTime(); // 15 Sep 2026
    const p = monthPeriod(anchor);
    expect(new Date(p.startMs)).toEqual(new Date(2026, 8, 1, 0, 0, 0, 0));
    expect(new Date(p.endMsExclusive)).toEqual(new Date(2026, 9, 1, 0, 0, 0, 0));
  });

  it('rolls the year over at December', () => {
    const anchor = new Date(2026, 11, 25).getTime(); // 25 Dec 2026
    const p = monthPeriod(anchor);
    expect(new Date(p.startMs)).toEqual(new Date(2026, 11, 1));
    expect(new Date(p.endMsExclusive)).toEqual(new Date(2027, 0, 1));
  });
});

describe('previousMonthPeriod', () => {
  it('is the calendar month immediately before, with no gap or overlap', () => {
    const p = monthPeriod(new Date(2026, 8, 15).getTime());
    const prev = previousMonthPeriod(p);
    expect(new Date(prev.startMs)).toEqual(new Date(2026, 7, 1));
    expect(prev.endMsExclusive).toBe(p.startMs);
  });

  it('rolls back across a year boundary from January', () => {
    const p = monthPeriod(new Date(2027, 0, 10).getTime());
    const prev = previousMonthPeriod(p);
    expect(new Date(prev.startMs)).toEqual(new Date(2026, 11, 1));
    expect(prev.endMsExclusive).toBe(p.startMs);
  });
});
