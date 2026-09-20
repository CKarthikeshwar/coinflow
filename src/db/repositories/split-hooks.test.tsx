/**
 * `useSplitsOverview` / `useSettlementsForTransaction` derive their view from the real repositories; the live
 * subscriptions are stubbed (a moving `data` array is the change signal, exactly as in production).
 */

import { renderHook } from '@testing-library/react-native';

import { insertTransaction } from '../test-support/fixtures';
import { createMemoryDb } from '../test-support/memory-db';
import { findOrCreatePerson } from './persons';
import { useSettlementsForTransaction, useSplitsOverview } from './split-hooks';
import { settle } from './settlements';
import { acceptRequest, receiveRequest } from './split-requests';
import { createSplit } from './splits';

let mockMem: ReturnType<typeof createMemoryDb>;
let mockCounter = 0;
let mockData: unknown[] = [];
let mockUpdatedAt: Date | undefined = new Date(1);
jest.mock('../client', () => ({
  get db() {
    return mockMem.db;
  },
}));
jest.mock('expo-crypto', () => ({
  randomUUID: () => `id-${++mockCounter}`,
  getRandomBytes: (n: number) => Uint8Array.from({ length: n }, (_v, i) => (mockCounter * 41 + i * 13) % 256),
}));
jest.mock('@/hooks/use-live-query', () => ({
  useLiveQuery: () => ({ data: mockData, error: undefined, updatedAt: mockUpdatedAt }),
}));

const db = () => mockMem.db;

beforeEach(() => {
  mockMem?.close();
  mockMem = createMemoryDb();
  mockCounter = 0;
  mockData = [];
  mockUpdatedAt = new Date(1);
});

function dinner() {
  const txn = insertTransaction(db(), { amountMinor: 120_000, note: 'Dinner' });
  const rahul = findOrCreatePerson({ displayName: 'Rahul', phone: '9845897555', source: 'manual' }, 50);
  const priya = findOrCreatePerson({ displayName: 'Priya', phone: '9742590888', source: 'manual' }, 50);
  const v = createSplit({
    transactionId: txn.id,
    shares: [
      { personId: rahul.id, amountMinor: 30_000 },
      { personId: priya.id, amountMinor: 20_000 },
    ],
  });
  return { txn, v };
}

describe('useSplitsOverview', () => {
  it('is empty and ready with no splits', async () => {
    const { result } = await renderHook(() => useSplitsOverview());
    expect(result.current).toMatchObject({ owed: [], owedTotalMinor: 0, youOweTotalMinor: 0, ready: true });
  });

  it('is not ready until every subscribed table has answered', async () => {
    mockUpdatedAt = undefined;
    const { result } = await renderHook(() => useSplitsOverview());
    expect(result.current.ready).toBe(false);
  });

  it('totals what is owed to you and what you owe, and moves settled items to the settled lists', async () => {
    const { v } = dinner();
    const req = receiveRequest({ fromPhone: '+919000000001', ref: 'ab2cd3', amountMinor: 45_000, note: 'Momos' }, 1000);
    if (req.kind !== 'created') throw new Error('setup failed');
    acceptRequest(req.request.id, 1001);
    const other = receiveRequest({ fromPhone: '+919000000002', ref: 'ef2gh3', amountMinor: 10_000 }, 1002);
    if (other.kind !== 'created') throw new Error('setup failed');

    const first = await renderHook(() => useSplitsOverview());
    expect(first.result.current.owedTotalMinor).toBe(50_000);
    expect(first.result.current.owed.map((g) => g.personName)).toEqual(['Rahul', 'Priya']);
    expect(first.result.current.youOweTotalMinor).toBe(45_000);
    expect(first.result.current.unattended).toHaveLength(1);
    expect(first.result.current.accepted).toHaveLength(1);
    await first.unmount();

    settle({ transactionId: insertTransaction(db(), { direction: 'credit', type: 'income', amountMinor: 30_000 }).id, picks: [{ shareId: v.shares[0].id }] });
    settle({ transactionId: insertTransaction(db(), { direction: 'debit', amountMinor: 45_000 }).id, picks: [{ requestId: req.request.id }] });
    mockData = [{}]; // a change in the subscribed tables
    const second = await renderHook(() => useSplitsOverview());
    expect(second.result.current.owedTotalMinor).toBe(20_000);
    expect(second.result.current.owedSettled.map((i) => i.personName)).toEqual(['Rahul']);
    expect(second.result.current.youOweTotalMinor).toBe(0);
    expect(second.result.current.youOweSettled).toHaveLength(1);
  });
});

describe('useSettlementsForTransaction', () => {
  it('lists what a payment settled and how much of it is allocated', async () => {
    const { v } = dinner();
    const c = insertTransaction(db(), { direction: 'credit', type: 'income', amountMinor: 60_000 });
    settle({ transactionId: c.id, picks: [{ shareId: v.shares[0].id }] });
    const { result } = await renderHook(() => useSettlementsForTransaction(c.id));
    expect(result.current.allocatedMinor).toBe(30_000);
    expect(result.current.lines).toHaveLength(1);
    expect(result.current.lines[0]).toMatchObject({ counterpartName: 'Rahul', kind: 'share', amountMinor: 30_000 });
  });

  it('is empty for a transaction that settled nothing, or no id', async () => {
    const c = insertTransaction(db(), { direction: 'credit', type: 'income', amountMinor: 100 });
    expect((await renderHook(() => useSettlementsForTransaction(c.id))).result.current).toEqual({ lines: [], allocatedMinor: 0 });
    expect((await renderHook(() => useSettlementsForTransaction(undefined))).result.current).toEqual({ lines: [], allocatedMinor: 0 });
  });
});
