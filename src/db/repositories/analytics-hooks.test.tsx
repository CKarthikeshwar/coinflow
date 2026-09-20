/**
 * Regression (found on a real phone, phase 3): Home / Analytics kept showing the un-split amounts after a split was
 * saved, because Drizzle's `useLiveQuery` only re-runs when the query's MAIN table changes. Every effective-amount
 * hook must therefore depend on a signal that moves when the split tables change.
 */

import { renderHook } from '@testing-library/react-native';

import { monthPeriod } from '@/domain/period';

import { createMemoryDb } from '../test-support/memory-db';
import {
  useCategoryBreakdown,
  useDailySeries,
  useLargestExpenses,
  usePeriodSummary,
  useRunningBalance,
  useSplitChangeSignal,
} from './analytics';

let mockMem: ReturnType<typeof createMemoryDb>;
let mockTick = 1_000;
const mockCalls: unknown[][] = [];
jest.mock('../client', () => ({
  get db() {
    return mockMem.db;
  },
}));
jest.mock('@/hooks/use-live-query', () => ({
  useLiveQuery: (_query: unknown, deps: unknown[] = []) => {
    mockCalls.push(deps);
    return { data: [], error: undefined, updatedAt: new Date(mockTick) };
  },
}));

const period = monthPeriod(new Date(2026, 8, 15).getTime());

beforeEach(() => {
  mockMem?.close();
  mockMem = createMemoryDb();
  mockTick = 1_000;
  mockCalls.length = 0;
});

describe('useSplitChangeSignal', () => {
  it('moves when any split table’s live query updates, and is stable otherwise', async () => {
    const { result, rerender } = await renderHook(() => useSplitChangeSignal());
    const first = result.current;
    await rerender({});
    expect(result.current).toBe(first);
    mockTick = 2_000;
    await rerender({});
    expect(result.current).toBeGreaterThan(first);
  });
});

const HOOKS: [string, () => unknown][] = [
  ['useRunningBalance', () => useRunningBalance()],
  ['usePeriodSummary', () => usePeriodSummary(period)],
  ['useCategoryBreakdown', () => useCategoryBreakdown(period)],
  ['useLargestExpenses', () => useLargestExpenses(period)],
  ['useDailySeries', () => useDailySeries(period)],
];

describe.each(HOOKS)('%s', (_name, hook) => {
  it('re-runs its query when split data changes (its deps include the split signal)', async () => {
    const { rerender } = await renderHook(hook);
    // the first three calls are the signal's own queries; what follows is the hook's query / queries
    const before = mockCalls.slice(3).map((d) => JSON.stringify(d));
    mockCalls.length = 0;
    mockTick = 5_000;
    await rerender({});
    const after = mockCalls.slice(3).map((d) => JSON.stringify(d));
    expect(after.length).toBeGreaterThan(0);
    expect(after).not.toEqual(before);
  });
});
