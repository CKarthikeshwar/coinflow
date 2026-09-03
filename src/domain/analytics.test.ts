import {
  buildDailySeries,
  dailyChartYMax,
  meanDailySpend,
  medianDailySpend,
  percentDelta,
  resolveCategoryColor,
  shareOf,
} from './analytics';
import { monthPeriod } from './period';

describe('percentDelta', () => {
  it('returns null when there is no prior-period figure to compare against', () => {
    expect(percentDelta(500, 0)).toBeNull();
  });

  it('computes a positive change', () => {
    expect(percentDelta(150, 100)).toBeCloseTo(0.5);
  });

  it('computes a negative change', () => {
    expect(percentDelta(50, 100)).toBeCloseTo(-0.5);
  });

  it('is zero when unchanged', () => {
    expect(percentDelta(100, 100)).toBe(0);
  });

  it('handles both current and previous being zero as no change, not "no data"', () => {
    expect(percentDelta(0, 0)).toBeNull();
  });
});

describe('buildDailySeries', () => {
  const period = monthPeriod(new Date(2026, 8, 15).getTime()); // Sep 2026, 30 days

  it('zero-fills every day up to min(periodEnd, today)', () => {
    const now = new Date(2026, 8, 5, 12, 0).getTime(); // 5 Sep, mid-month "today"
    const series = buildDailySeries([], period, now);
    expect(series).toHaveLength(5); // 1st–5th inclusive (today's day counts)
    expect(series.every((d) => d.amountMinor === 0)).toBe(true);
  });

  it('sums same-day rows into one bucket', () => {
    const day3 = new Date(2026, 8, 3, 9, 0).getTime();
    const day3Later = new Date(2026, 8, 3, 21, 0).getTime();
    const now = new Date(2026, 8, 10).getTime();
    const series = buildDailySeries(
      [
        { occurredAt: day3, amountMinor: 100 },
        { occurredAt: day3Later, amountMinor: 250 },
      ],
      period,
      now,
    );
    const bucket = series.find((d) => new Date(d.dayStartMs).getDate() === 3);
    expect(bucket?.amountMinor).toBe(350);
  });

  it('ignores a row outside the period', () => {
    const beforePeriod = new Date(2026, 7, 20).getTime(); // August
    const now = new Date(2026, 8, 10).getTime();
    const series = buildDailySeries([{ occurredAt: beforePeriod, amountMinor: 999 }], period, now);
    expect(series.reduce((s, d) => s + d.amountMinor, 0)).toBe(0);
  });

  it('spans the full period when "today" is after the period ends', () => {
    const now = new Date(2026, 9, 15).getTime(); // October — Sep period is fully past
    const series = buildDailySeries([], period, now);
    expect(series).toHaveLength(30);
  });
});

describe('meanDailySpend / medianDailySpend', () => {
  it('mean is total / day count', () => {
    const series = [
      { dayStartMs: 1, amountMinor: 100 },
      { dayStartMs: 2, amountMinor: 0 },
      { dayStartMs: 3, amountMinor: 200 },
    ];
    expect(meanDailySpend(series)).toBeCloseTo(100);
  });

  it('median is the middle value on an odd count', () => {
    const series = [
      { dayStartMs: 1, amountMinor: 300 },
      { dayStartMs: 2, amountMinor: 100 },
      { dayStartMs: 3, amountMinor: 200 },
    ];
    expect(medianDailySpend(series)).toBe(200);
  });

  it('median is the mean of the two middles on an even count', () => {
    const series = [
      { dayStartMs: 1, amountMinor: 100 },
      { dayStartMs: 2, amountMinor: 300 },
      { dayStartMs: 3, amountMinor: 200 },
      { dayStartMs: 4, amountMinor: 400 },
    ];
    expect(medianDailySpend(series)).toBe(250);
  });

  it('a single rent-day spike moves the mean far more than the median', () => {
    const series = [
      { dayStartMs: 1, amountMinor: 100 },
      { dayStartMs: 2, amountMinor: 100 },
      { dayStartMs: 3, amountMinor: 100 },
      { dayStartMs: 4, amountMinor: 10_000 }, // rent
    ];
    expect(medianDailySpend(series)).toBe(100);
    expect(meanDailySpend(series)).toBeGreaterThan(2500);
  });

  it('both are 0, not NaN, for an empty series', () => {
    expect(meanDailySpend([])).toBe(0);
    expect(medianDailySpend([])).toBe(0);
  });
});

describe('dailyChartYMax', () => {
  it('is 1 (not 0) when every day is zero', () => {
    const series = [
      { dayStartMs: 1, amountMinor: 0 },
      { dayStartMs: 2, amountMinor: 0 },
    ];
    expect(dailyChartYMax(series)).toBe(1);
  });

  it('a single outlier does not become the axis max — p95 clips it', () => {
    const series = [
      ...Array.from({ length: 19 }, (_, i) => ({ dayStartMs: i, amountMinor: 100 })),
      { dayStartMs: 20, amountMinor: 10_000 }, // the 20th day, a rent spike
    ];
    const yMax = dailyChartYMax(series);
    expect(yMax).toBeLessThan(10_000);
    expect(yMax).toBeGreaterThanOrEqual(100);
  });

  it('is the max value itself when every day is non-zero and roughly even', () => {
    const series = [
      { dayStartMs: 1, amountMinor: 50 },
      { dayStartMs: 2, amountMinor: 80 },
    ];
    expect(dailyChartYMax(series)).toBe(80);
  });
});

describe('shareOf', () => {
  it('divides amount by total', () => {
    expect(shareOf(25, 100)).toBeCloseTo(0.25);
  });

  it('is 0, not NaN, when total is 0', () => {
    expect(shareOf(0, 0)).toBe(0);
  });
});

describe('resolveCategoryColor', () => {
  const palette = { food: '#f00', bills: '#0f0', other: '#00f' };

  it('a default category (key present in the palette) gets its own fixed hue', () => {
    expect(resolveCategoryColor({ key: 'food', order: 5 }, palette)).toBe('#f00');
  });

  it('a custom category (key null) cycles through the palette by order', () => {
    // palette has 3 entries: order 0 -> food, 1 -> bills, 2 -> other, 3 -> food again
    expect(resolveCategoryColor({ key: null, order: 0 }, palette)).toBe('#f00');
    expect(resolveCategoryColor({ key: null, order: 1 }, palette)).toBe('#0f0');
    expect(resolveCategoryColor({ key: null, order: 3 }, palette)).toBe('#f00');
  });

  it('a key not present in the palette (defensive) also falls back to cycling', () => {
    expect(resolveCategoryColor({ key: 'not-a-real-key', order: 2 }, palette)).toBe('#00f');
  });
});
