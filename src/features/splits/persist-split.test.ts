import { insertTransaction } from '@/db/test-support/fixtures';
import { createMemoryDb } from '@/db/test-support/memory-db';
import { listPersons } from '@/db/repositories/persons';
import { getSplitForTransaction } from '@/db/repositories/splits';
import { settle } from '@/db/repositories/settlements';
import type { CommittedShare } from '@/stores/split-draft';

import { persistSplitDraft } from './persist-split';

let mockMem: ReturnType<typeof createMemoryDb>;
let mockCounter = 0;
jest.mock('@/db/client', () => ({
  get db() {
    return mockMem.db;
  },
}));
jest.mock('expo-crypto', () => ({
  randomUUID: () => `id-${++mockCounter}`,
  getRandomBytes: (n: number) => Uint8Array.from({ length: n }, (_v, i) => (mockCounter * 59 + i * 31) % 256),
}));

const db = () => mockMem.db;
const share = (key: string, name: string, phone: string, amountMinor: number, extra: Partial<CommittedShare> = {}): CommittedShare => ({
  key, personId: null, name, phone, contactRef: null, source: 'manual', amountMinor, ...extra,
});

beforeEach(() => {
  mockMem?.close();
  mockMem = createMemoryDb();
  mockCounter = 0;
});

describe('persistSplitDraft', () => {
  it('creates people (by number) and the split for a new draft', () => {
    const t = insertTransaction(db(), { amountMinor: 120_000 });
    const r = persistSplitDraft(
      t.id,
      { committed: [share('n:1', 'Rahul', '98458 97555', 30_000), share('n:2', 'Priya', '+91 97425 90888', 30_000)], existingSplitId: null, removed: false, send: false },
      { now: 500 },
    );
    expect(r).toEqual({ kind: 'created', splitId: expect.any(String) });
    const v = getSplitForTransaction(t.id)!;
    expect(v.shares.map((s) => [s.person.displayName, s.person.phoneKey, s.amountMinor])).toEqual([
      ['Rahul', '9845897555', 30_000],
      ['Priya', '9742590888', 30_000],
    ]);
    expect(v.yourMinor).toBe(60_000);
  });

  it('reuses an already-saved person instead of creating a duplicate', () => {
    const t1 = insertTransaction(db());
    persistSplitDraft(t1.id, { committed: [share('n:1', 'Rahul', '9845897555', 100)], existingSplitId: null, removed: false, send: false });
    const [saved] = listPersons();
    const t2 = insertTransaction(db());
    persistSplitDraft(t2.id, { committed: [share(saved.id, 'Rahul', '9845897555', 200, { personId: saved.id })], existingSplitId: null, removed: false, send: false });
    expect(listPersons()).toHaveLength(1);
  });

  it('a same-number person typed again resolves to the same person', () => {
    const t1 = insertTransaction(db());
    const t2 = insertTransaction(db());
    persistSplitDraft(t1.id, { committed: [share('n:1', 'Rahul', '9845897555', 100)], existingSplitId: null, removed: false, send: false });
    persistSplitDraft(t2.id, { committed: [share('n:1', 'Rahul M', '09845897555', 100)], existingSplitId: null, removed: false, send: false });
    expect(listPersons()).toHaveLength(1);
  });

  it('updates an existing split in place (edit), keeping each person’s row and settlements', () => {
    const t = insertTransaction(db(), { amountMinor: 120_000 });
    persistSplitDraft(t.id, {
      committed: [share('n:1', 'Rahul', '9845897555', 30_000), share('n:2', 'Priya', '9742590888', 30_000)],
      existingSplitId: null, removed: false, send: false,
    });
    const before = getSplitForTransaction(t.id)!;
    const rahulShare = before.shares[0].id;
    settle({ transactionId: insertTransaction(db(), { direction: 'credit', type: 'income', amountMinor: 10_000 }).id, picks: [{ shareId: rahulShare }] });

    const r = persistSplitDraft(t.id, {
      committed: [
        share(before.shares[0].personId, 'Rahul', '9845897555', 40_000, { personId: before.shares[0].personId }),
        share(before.shares[1].personId, 'Priya', '9742590888', 30_000, { personId: before.shares[1].personId }),
      ],
      existingSplitId: before.split.id, removed: false, send: false,
    });
    expect(r).toEqual({ kind: 'updated', splitId: before.split.id });
    const after = getSplitForTransaction(t.id)!;
    expect(after.shares[0].id).toBe(rahulShare); // same row
    expect(after.shares[0]).toMatchObject({ amountMinor: 40_000, settledMinor: 10_000 }); // settlement kept
    expect(after.yourMinor).toBe(50_000);
  });

  it('removes an existing split', () => {
    const t = insertTransaction(db());
    persistSplitDraft(t.id, { committed: [share('n:1', 'Rahul', '9845897555', 100)], existingSplitId: null, removed: false, send: false });
    const v = getSplitForTransaction(t.id)!;
    expect(persistSplitDraft(t.id, { committed: null, existingSplitId: v.split.id, removed: true, send: false })).toEqual({ kind: 'removed' });
    expect(getSplitForTransaction(t.id)).toBeUndefined();
  });

  it('does nothing for an empty draft', () => {
    const t = insertTransaction(db());
    expect(persistSplitDraft(t.id, { committed: null, existingSplitId: null, removed: false, send: false })).toEqual({ kind: 'none' });
    expect(getSplitForTransaction(t.id)).toBeUndefined();
  });

  it('never splits a credit, and drops a split left over from when it was a debit', () => {
    const t = insertTransaction(db());
    persistSplitDraft(t.id, { committed: [share('n:1', 'Rahul', '9845897555', 100)], existingSplitId: null, removed: false, send: false });
    const v = getSplitForTransaction(t.id)!;
    expect(
      persistSplitDraft(t.id, { committed: [share('n:1', 'Rahul', '9845897555', 100)], existingSplitId: v.split.id, removed: false, send: false }, { direction: 'credit' }),
    ).toEqual({ kind: 'removed' });
    const c = insertTransaction(db(), { direction: 'credit', type: 'income' });
    expect(persistSplitDraft(c.id, { committed: [share('n:1', 'Rahul', '9845897555', 100)], existingSplitId: null, removed: false, send: false }, { direction: 'credit' })).toEqual({ kind: 'none' });
  });

  it('propagates the repository’s rejection (e.g. an over-total split) so the caller can tell the user', () => {
    const t = insertTransaction(db(), { amountMinor: 1_000 });
    expect(() =>
      persistSplitDraft(t.id, { committed: [share('n:1', 'Rahul', '9845897555', 5_000)], existingSplitId: null, removed: false, send: false }),
    ).toThrow(RangeError);
    expect(getSplitForTransaction(t.id)).toBeUndefined();
  });

  it('rejects a person with an invalid number', () => {
    const t = insertTransaction(db());
    expect(() =>
      persistSplitDraft(t.id, { committed: [share('n:1', 'X', '12345', 100)], existingSplitId: null, removed: false, send: false }),
    ).toThrow(RangeError);
  });
});
