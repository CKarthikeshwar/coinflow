/**
 * Widget snapshot publishing (SPEC-implementation.md §44.2–§44.3, IMP-090 / IMP-096): real repositories on an
 * in-memory database, the native bridge mocked. The key property is IMP-096 — the widget's Balance is the same
 * effective Income − Spent the Analytics card computes.
 */

import { setSetting } from '@/db/repositories/settings';
import { insertIfNew } from '@/db/repositories/suggestions';
import { insertTransaction } from '@/db/test-support/fixtures';
import { createMemoryDb } from '@/db/test-support/memory-db';
import { monthPeriod } from '@/domain/period';

import { cancelScheduledPublish, computeWidgetSnapshot, publishWidgetSnapshotNow, schedulePublish } from './publish';

let mockMem: ReturnType<typeof createMemoryDb>;
let mockCounter = 0;
jest.mock('@/db/client', () => ({
  get db() {
    return mockMem.db;
  },
}));
jest.mock('expo-crypto', () => ({
  randomUUID: () => `id-${++mockCounter}`,
  getRandomBytes: (n: number) => Uint8Array.from({ length: n }, (_v, i) => (mockCounter * 41 + i * 13) % 256),
}));
const mockNative = jest.fn<boolean, [string]>();
jest.mock('@/services/sms', () => ({ publishWidgetSnapshotJson: (json: string) => mockNative(json) }));

const NOW = new Date(2026, 8, 15, 12).getTime(); // 15 Sep 2026
const inMonth = (day: number) => new Date(2026, 8, day, 10).getTime();

beforeEach(() => {
  mockMem?.close();
  mockMem = createMemoryDb();
  mockCounter = 0;
  mockNative.mockReset().mockReturnValue(true);
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
});
afterEach(() => {
  cancelScheduledPublish();
  jest.useRealTimers();
});

describe('computeWidgetSnapshot', () => {
  it('is Income − Spent for the current calendar month only', () => {
    insertTransaction(mockMem.db, { direction: 'debit', type: 'expense', amountMinor: 30_000, occurredAt: inMonth(3) });
    insertTransaction(mockMem.db, { direction: 'credit', type: 'income', amountMinor: 100_000, occurredAt: inMonth(5) });
    insertTransaction(mockMem.db, { direction: 'debit', type: 'expense', amountMinor: 999_00, occurredAt: new Date(2026, 7, 20).getTime() });
    const s = computeWidgetSnapshot(NOW);
    expect(s).toMatchObject({ v: 1, spentMinor: 30_000, incomeMinor: 100_000, balanceMinor: 70_000, periodLabel: 'September' });
    expect(s.periodStartMs).toBe(monthPeriod(NOW).startMs);
    expect(s.periodEndMs).toBe(monthPeriod(NOW).endMsExclusive);
  });

  it('is zeros (not an error) for an empty month', () => {
    expect(computeWidgetSnapshot(NOW)).toMatchObject({ incomeMinor: 0, spentMinor: 0, balanceMinor: 0, pending: { count: 0, items: [] } });
  });

  it('reports pending suggestions and the hide-amounts setting', () => {
    insertIfNew({ amountMinor: 45_000, direction: 'debit', account: 'HDFC', smsSender: 'HDFCBK', smsReceivedAt: 1, dedupeKey: 'k1' });
    setSetting('widgetHideAmounts', true);
    const s = computeWidgetSnapshot(NOW);
    expect(s.pending.count).toBe(1);
    expect(s.pending.items[0]).toMatchObject({ amountMinor: 45_000, direction: 'debit', label: 'HDFC' });
    expect(s.hideAmounts).toBe(true);
  });
});

describe('publishing', () => {
  it('hands the JSON to the native side and records when', () => {
    expect(publishWidgetSnapshotNow()).toBe(true);
    expect(JSON.parse(mockNative.mock.calls[0][0])).toMatchObject({ v: 1, periodLabel: 'September' });
  });

  it('never throws when the native side is unavailable', () => {
    mockNative.mockReturnValue(false);
    expect(publishWidgetSnapshotNow()).toBe(false);
  });

  it('never throws when the native call blows up', () => {
    mockNative.mockImplementation(() => {
      throw new Error('boom');
    });
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(publishWidgetSnapshotNow()).toBe(false);
  });

  it('debounces a burst into one publish, 1 s after the last call', () => {
    schedulePublish();
    jest.advanceTimersByTime(600);
    schedulePublish();
    jest.advanceTimersByTime(600);
    expect(mockNative).not.toHaveBeenCalled();
    jest.advanceTimersByTime(500);
    expect(mockNative).toHaveBeenCalledTimes(1);
  });
});
