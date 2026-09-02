import { formatDayHeader, formatWhen } from './when';

const NOW = new Date('2026-09-02T12:00:00.000Z').getTime();

describe('formatWhen', () => {
  it('"just now" under 60 seconds', () => {
    expect(formatWhen(NOW - 30_000, NOW)).toBe('just now');
  });

  it('minutes ago under an hour', () => {
    expect(formatWhen(NOW - 5 * 60_000, NOW)).toBe('5m ago');
  });

  it('hours ago under a day', () => {
    expect(formatWhen(NOW - 3 * 60 * 60_000, NOW)).toBe('3h ago');
  });

  it('"Yesterday" for 1-2 days ago', () => {
    expect(formatWhen(NOW - 30 * 60 * 60_000, NOW)).toBe('Yesterday');
  });

  it('"N days ago" within the week', () => {
    expect(formatWhen(NOW - 4 * 24 * 60 * 60_000, NOW)).toBe('4 days ago');
  });

  it('absolute date beyond a week, same year', () => {
    const ts = new Date('2026-08-01T12:00:00.000Z').getTime();
    expect(formatWhen(ts, NOW)).toBe('1 Aug');
  });

  it('absolute date with year when not the current year', () => {
    const ts = new Date('2025-08-01T12:00:00.000Z').getTime();
    expect(formatWhen(ts, NOW)).toBe('1 Aug 2025');
  });
});

describe('formatDayHeader', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('"Today" for the current day', () => {
    expect(formatDayHeader(NOW)).toBe('Today');
  });

  it('"Yesterday" for the previous day', () => {
    expect(formatDayHeader(NOW - 24 * 60 * 60_000)).toBe('Yesterday');
  });

  it('"EEE, d MMM" further back', () => {
    const ts = new Date('2026-08-01T12:00:00.000Z').getTime();
    expect(formatDayHeader(ts)).toBe('Sat, 1 Aug');
  });
});
