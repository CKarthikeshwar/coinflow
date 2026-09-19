import { eq } from 'drizzle-orm';

import { persons, splitShares, splits, transactions } from '../schema';
import { insertTransaction } from '../test-support/fixtures';
import { createMemoryDb } from '../test-support/memory-db';
import { findOrCreatePerson } from './persons';
import { settle } from './settlements';
import {
  countSplits,
  createSplit,
  getSplit,
  getSplitByRef,
  getSplitForTransaction,
  listOpenShares,
  listOwedByPerson,
  owedToYouMinor,
  removeSplit,
  replaceShares,
  setShareRequestResult,
  splitsForTransactions,
  unwaiveShare,
  validateAmountChange,
  waiveShare,
} from './splits';

let mockMem: ReturnType<typeof createMemoryDb>;
let mockCounter = 0;
jest.mock('../client', () => ({
  get db() {
    return mockMem.db;
  },
}));
jest.mock('expo-crypto', () => ({
  randomUUID: () => `id-${++mockCounter}`,
  getRandomBytes: (n: number) => Uint8Array.from({ length: n }, (_v, i) => (mockCounter * 37 + i * 11) % 256),
}));

const db = () => mockMem.db;
const person = (name: string, phone: string) => findOrCreatePerson({ displayName: name, phone, source: 'manual' }, 50);

beforeEach(() => {
  mockMem?.close();
  mockMem = createMemoryDb();
  mockCounter = 0;
});

describe('createSplit (IMP-070)', () => {
  it('creates a split and derives your share, effective spend and state — nothing about them is stored', () => {
    const txn = insertTransaction(db(), { amountMinor: 120_000, note: 'Dinner' });
    const rahul = person('Rahul', '9845897555');
    const priya = person('Priya', '9742590888');
    const view = createSplit({
      transactionId: txn.id,
      shares: [
        { personId: rahul.id, amountMinor: 30_000 },
        { personId: priya.id, amountMinor: 30_000 },
      ],
    });
    expect(view.transactionAmountMinor).toBe(120_000);
    expect(view.yourMinor).toBe(60_000);
    expect(view.effectiveMinor).toBe(60_000);
    expect(view.state).toBe('open');
    expect(view.shares.map((s) => [s.person.displayName, s.amountMinor, s.state])).toEqual([
      ['Rahul', 30_000, 'pending'],
      ['Priya', 30_000, 'pending'],
    ]);
    expect(view.split.ref).toMatch(/^[a-z2-7]{6}$/);
    // the tables hold no "your share" / status column at all (D36)
    expect(Object.keys(mockMem.raw.prepare('select * from split limit 1').get() as object)).toEqual(
      expect.not.arrayContaining(['myShareMinor', 'status']),
    );
  });

  it('allows your share to be exactly ₹0', () => {
    const txn = insertTransaction(db(), { amountMinor: 60_000 });
    const a = person('A', '9000000001');
    const b = person('B', '9000000002');
    const view = createSplit({
      transactionId: txn.id,
      shares: [
        { personId: a.id, amountMinor: 30_000 },
        { personId: b.id, amountMinor: 30_000 },
      ],
    });
    expect(view.yourMinor).toBe(0);
    expect(view.effectiveMinor).toBe(0);
  });

  it('rejects shares that exceed the amount, zero/negative shares, no shares, and a duplicate person — writing nothing', () => {
    const txn = insertTransaction(db(), { amountMinor: 60_000 });
    const a = person('A', '9000000001');
    expect(() => createSplit({ transactionId: txn.id, shares: [{ personId: a.id, amountMinor: 70_000 }] })).toThrow(RangeError);
    expect(() => createSplit({ transactionId: txn.id, shares: [{ personId: a.id, amountMinor: 0 }] })).toThrow(RangeError);
    expect(() => createSplit({ transactionId: txn.id, shares: [{ personId: a.id, amountMinor: -5 }] })).toThrow(RangeError);
    expect(() => createSplit({ transactionId: txn.id, shares: [] })).toThrow(RangeError);
    expect(() =>
      createSplit({ transactionId: txn.id, shares: [{ personId: a.id, amountMinor: 100 }, { personId: a.id, amountMinor: 100 }] }),
    ).toThrow(RangeError);
    expect(countSplits()).toBe(0);
    expect(db().select().from(splitShares).all()).toEqual([]);
  });

  it('refuses a missing or soft-deleted transaction, and a second split on the same transaction', () => {
    const a = person('A', '9000000001');
    expect(() => createSplit({ transactionId: 'nope', shares: [{ personId: a.id, amountMinor: 10 }] })).toThrow('transaction not found');
    const deleted = insertTransaction(db(), { deletedAt: 5 });
    expect(() => createSplit({ transactionId: deleted.id, shares: [{ personId: a.id, amountMinor: 10 }] })).toThrow('transaction not found');
    const txn = insertTransaction(db());
    createSplit({ transactionId: txn.id, shares: [{ personId: a.id, amountMinor: 10 }] });
    expect(() => createSplit({ transactionId: txn.id, shares: [{ personId: a.id, amountMinor: 10 }] })).toThrow('already split');
  });

  it('rolls back completely when a share row fails (unknown person)', () => {
    const txn = insertTransaction(db());
    expect(() => createSplit({ transactionId: txn.id, shares: [{ personId: 'ghost', amountMinor: 100 }] })).toThrow();
    expect(db().select().from(splits).all()).toEqual([]); // the split row was rolled back too
  });

  it('can be looked up by transaction, by id and by ref', () => {
    const txn = insertTransaction(db());
    const a = person('A', '9000000001');
    const v = createSplit({ transactionId: txn.id, shares: [{ personId: a.id, amountMinor: 100 }] });
    expect(getSplitForTransaction(txn.id)?.split.id).toBe(v.split.id);
    expect(getSplit(v.split.id)?.split.ref).toBe(v.split.ref);
    expect(getSplitByRef(v.split.ref)?.split.id).toBe(v.split.id);
    expect(getSplitForTransaction('other')).toBeUndefined();
  });

  it('bumps the people to the top of "Saved people"', () => {
    const txn = insertTransaction(db());
    const a = findOrCreatePerson({ displayName: 'A', phone: '9000000001', source: 'manual' }, 10);
    createSplit({ transactionId: txn.id, shares: [{ personId: a.id, amountMinor: 100 }] }, 999);
    expect(db().select().from(persons).where(eq(persons.id, a.id)).get()?.updatedAt).toBe(999);
  });
});

describe('database-level guarantees (IMP-084, D36/D37)', () => {
  it('enforces one split per transaction and a unique ref at the database', () => {
    const txn = insertTransaction(db());
    db().insert(splits).values({ id: 's1', ref: 'aaaaaa', transactionId: txn.id, createdAt: 1, updatedAt: 1 }).run();
    expect(() => db().insert(splits).values({ id: 's2', ref: 'bbbbbb', transactionId: txn.id, createdAt: 1, updatedAt: 1 }).run()).toThrow();
    const t2 = insertTransaction(db());
    expect(() => db().insert(splits).values({ id: 's3', ref: 'aaaaaa', transactionId: t2.id, createdAt: 1, updatedAt: 1 }).run()).toThrow();
  });

  it('rejects a zero-paise share at the database (CHECK)', () => {
    const txn = insertTransaction(db());
    const a = person('A', '9000000001');
    db().insert(splits).values({ id: 's1', ref: 'aaaaaa', transactionId: txn.id, createdAt: 1, updatedAt: 1 }).run();
    expect(() =>
      db().insert(splitShares).values({ id: 'x', splitId: 's1', personId: a.id, amountMinor: 0, createdAt: 1, updatedAt: 1 }).run(),
    ).toThrow();
  });

  it('does not let a person be deleted while a share refers to them (RESTRICT)', () => {
    const txn = insertTransaction(db());
    const a = person('A', '9000000001');
    createSplit({ transactionId: txn.id, shares: [{ personId: a.id, amountMinor: 100 }] });
    expect(() => db().delete(persons).where(eq(persons.id, a.id)).run()).toThrow();
  });

  it('cascades a hard purge of the transaction to its split, shares and settlements', () => {
    const txn = insertTransaction(db(), { amountMinor: 100_000 });
    const credit = insertTransaction(db(), { direction: 'credit', type: 'income', amountMinor: 30_000 });
    const a = person('A', '9000000001');
    const v = createSplit({ transactionId: txn.id, shares: [{ personId: a.id, amountMinor: 30_000 }] });
    settle({ transactionId: credit.id, picks: [{ shareId: v.shares[0].id }] });
    expect(mockMem.raw.prepare('select count(*) c from settlement').get()).toEqual({ c: 1 });

    db().delete(transactions).where(eq(transactions.id, txn.id)).run(); // what §20.6 purge does

    expect(db().select().from(splits).all()).toEqual([]);
    expect(db().select().from(splitShares).all()).toEqual([]);
    expect(mockMem.raw.prepare('select count(*) c from settlement').get()).toEqual({ c: 0 });
    expect(db().select().from(transactions).where(eq(transactions.id, credit.id)).get()).toBeDefined(); // the settling credit stays
  });
});

describe('replaceShares (edit mode)', () => {
  function setup() {
    const txn = insertTransaction(db(), { amountMinor: 120_000 });
    const a = person('A', '9000000001');
    const b = person('B', '9000000002');
    const c = person('C', '9000000003');
    const v = createSplit({
      transactionId: txn.id,
      shares: [
        { personId: a.id, amountMinor: 30_000 },
        { personId: b.id, amountMinor: 30_000 },
      ],
    });
    return { txn, a, b, c, v };
  }

  it('keeps existing people’s rows, updates amounts, adds new people, removes dropped ones', () => {
    const { a, b, c, v } = setup();
    const aShareId = v.shares.find((s) => s.personId === a.id)!.id;
    const after = replaceShares(v.split.id, [
      { personId: a.id, amountMinor: 40_000 },
      { personId: c.id, amountMinor: 20_000 },
    ]);
    expect(after.shares.map((s) => [s.personId, s.amountMinor]).sort()).toEqual(
      [[a.id, 40_000], [c.id, 20_000]].sort(),
    );
    expect(after.shares.find((s) => s.personId === a.id)!.id).toBe(aShareId); // same row, history intact
    expect(after.shares.some((s) => s.personId === b.id)).toBe(false);
    expect(after.yourMinor).toBe(60_000);
  });

  it('refuses to remove a person who has already paid, and to lower a share below what was paid', () => {
    const { txn, a, b, v } = setup();
    const credit = insertTransaction(db(), { direction: 'credit', type: 'income', amountMinor: 20_000 });
    settle({ transactionId: credit.id, picks: [{ shareId: v.shares.find((s) => s.personId === a.id)!.id }] });
    expect(() => replaceShares(v.split.id, [{ personId: b.id, amountMinor: 30_000 }])).toThrow('already paid');
    expect(() => replaceShares(v.split.id, [{ personId: a.id, amountMinor: 10_000 }, { personId: b.id, amountMinor: 30_000 }])).toThrow(
      'below what is already settled',
    );
    // nothing changed
    expect(getSplitForTransaction(txn.id)!.shares).toHaveLength(2);
  });

  it('rejects an over-total edit atomically', () => {
    const { a, b, v } = setup();
    expect(() =>
      replaceShares(v.split.id, [{ personId: a.id, amountMinor: 100_000 }, { personId: b.id, amountMinor: 100_000 }]),
    ).toThrow(RangeError);
    expect(getSplit(v.split.id)!.shares.map((s) => s.amountMinor)).toEqual([30_000, 30_000]);
  });

  it('flags "changed since requested" once the amount differs from what the last request said', () => {
    const { a, v } = setup();
    const shareId = v.shares.find((s) => s.personId === a.id)!.id;
    setShareRequestResult(shareId, 'sent', 30_000, 77);
    expect(getSplit(v.split.id)!.shares.find((s) => s.id === shareId)!.changedSinceRequested).toBe(false);
    replaceShares(v.split.id, [{ personId: a.id, amountMinor: 35_000 }, { personId: v.shares.find((s) => s.personId !== a.id)!.personId, amountMinor: 30_000 }]);
    const s = getSplit(v.split.id)!.shares.find((x) => x.id === shareId)!;
    expect(s.changedSinceRequested).toBe(true);
    expect(s.requestState).toBe('sent');
  });
});

describe('waive / unwaive (IMP-073)', () => {
  it('a waived share stops being owed and you absorb it in your effective spend', () => {
    const txn = insertTransaction(db(), { amountMinor: 90_000 });
    const a = person('A', '9000000001');
    const b = person('B', '9000000002');
    const v = createSplit({
      transactionId: txn.id,
      shares: [{ personId: a.id, amountMinor: 30_000 }, { personId: b.id, amountMinor: 30_000 }],
    });
    expect(v.effectiveMinor).toBe(30_000);
    waiveShare(v.shares[0].id, 123);
    const after = getSplit(v.split.id)!;
    expect(after.effectiveMinor).toBe(60_000); // you absorbed A's ₹300
    expect(after.shares[0].state).toBe('waived');
    expect(after.yourMinor).toBe(30_000); // invariant untouched: amount − Σ ALL shares
    expect(owedToYouMinor()).toBe(30_000);
    unwaiveShare(v.shares[0].id);
    expect(getSplit(v.split.id)!.effectiveMinor).toBe(30_000);
    expect(owedToYouMinor()).toBe(60_000);
  });
});

describe('setShareRequestResult', () => {
  it('records a sent request and clears the timestamp on failure', () => {
    const txn = insertTransaction(db());
    const a = person('A', '9000000001');
    const v = createSplit({ transactionId: txn.id, shares: [{ personId: a.id, amountMinor: 100 }] });
    const id = v.shares[0].id;
    setShareRequestResult(id, 'sent', 100, 500);
    expect(getSplit(v.split.id)!.shares[0]).toMatchObject({ requestState: 'sent', requestSentAt: 500, requestedAmountMinor: 100 });
    setShareRequestResult(id, 'failed', null, 600);
    expect(getSplit(v.split.id)!.shares[0]).toMatchObject({ requestState: 'failed', requestSentAt: null, requestedAmountMinor: 100 });
    setShareRequestResult(id, 'opened_in_sms_app', 100, 700);
    expect(getSplit(v.split.id)!.shares[0].requestState).toBe('opened_in_sms_app');
  });
});

describe('validateAmountChange (IMP-089)', () => {
  it('always allows a change on an unsplit transaction', () => {
    const txn = insertTransaction(db());
    expect(validateAmountChange(txn.id, 5)).toEqual({ ok: true, yourMinor: null });
  });

  it('keeps others’ shares and recomputes yours; blocks when yours would go negative', () => {
    const txn = insertTransaction(db(), { amountMinor: 120_000 });
    const a = person('A', '9000000001');
    createSplit({ transactionId: txn.id, shares: [{ personId: a.id, amountMinor: 30_000 }, ...[]] });
    expect(validateAmountChange(txn.id, 150_000)).toEqual({ ok: true, yourMinor: 120_000 });
    expect(validateAmountChange(txn.id, 30_000)).toEqual({ ok: true, yourMinor: 0 });
    expect(validateAmountChange(txn.id, 20_000)).toEqual({ ok: false, yourMinor: -10_000 });
  });
});

describe('owed lists (IMP-076)', () => {
  it('groups open shares by person, largest first, and ignores settled / waived / deleted-transaction shares', () => {
    const t1 = insertTransaction(db(), { amountMinor: 100_000, note: 'Dinner' });
    const t2 = insertTransaction(db(), { amountMinor: 60_000, note: 'Cab' });
    const gone = insertTransaction(db(), { amountMinor: 50_000, note: 'Gone' });
    const amit = person('Amit', '9000000001');
    const priya = person('Priya', '9000000002');
    const v1 = createSplit({ transactionId: t1.id, shares: [{ personId: amit.id, amountMinor: 30_000 }, { personId: priya.id, amountMinor: 30_000 }] });
    createSplit({ transactionId: t2.id, shares: [{ personId: amit.id, amountMinor: 40_000 }] });
    createSplit({ transactionId: gone.id, shares: [{ personId: amit.id, amountMinor: 10_000 }] });
    db().update(transactions).set({ deletedAt: 9 }).where(eq(transactions.id, gone.id)).run(); // soft-deleted (Undo window)
    // Priya part-pays: ₹100 of her ₹300
    const credit = insertTransaction(db(), { direction: 'credit', type: 'income', amountMinor: 10_000 });
    settle({ transactionId: credit.id, picks: [{ shareId: v1.shares.find((s) => s.personId === priya.id)!.id }] });

    const groups = listOwedByPerson();
    expect(groups.map((g) => [g.personName, g.totalMinor])).toEqual([['Amit', 70_000], ['Priya', 20_000]]);
    expect(groups[0].items.map((i) => [i.label, i.remainingMinor])).toEqual([['Dinner', 30_000], ['Cab', 40_000]]);
    expect(groups[1].items[0]).toMatchObject({ amountMinor: 30_000, settledMinor: 10_000, remainingMinor: 20_000, state: 'partial' });
    expect(owedToYouMinor()).toBe(90_000);
    expect(listOpenShares().every((i) => i.state !== 'settled')).toBe(true);
  });

  it('a share settled in full drops off the list', () => {
    const t = insertTransaction(db(), { amountMinor: 100_000 });
    const a = person('A', '9000000001');
    const v = createSplit({ transactionId: t.id, shares: [{ personId: a.id, amountMinor: 30_000 }] });
    const credit = insertTransaction(db(), { direction: 'credit', type: 'income', amountMinor: 30_000 });
    settle({ transactionId: credit.id, picks: [{ shareId: v.shares[0].id }] });
    expect(listOwedByPerson()).toEqual([]);
    expect(getSplit(v.split.id)!.state).toBe('settled');
  });
});

describe('removeSplit / splitsForTransactions', () => {
  it('removing a split deletes its shares and their settlements but not the settling transaction', () => {
    const t = insertTransaction(db(), { amountMinor: 100_000 });
    const a = person('A', '9000000001');
    const v = createSplit({ transactionId: t.id, shares: [{ personId: a.id, amountMinor: 30_000 }] });
    const credit = insertTransaction(db(), { direction: 'credit', type: 'income', amountMinor: 30_000 });
    settle({ transactionId: credit.id, picks: [{ shareId: v.shares[0].id }] });
    removeSplit(v.split.id);
    expect(getSplitForTransaction(t.id)).toBeUndefined();
    expect(mockMem.raw.prepare('select count(*) c from settlement').get()).toEqual({ c: 0 });
    expect(db().select().from(transactions).where(eq(transactions.id, credit.id)).get()).toBeDefined();
  });

  it('looks up several transactions at once', () => {
    const t1 = insertTransaction(db());
    const t2 = insertTransaction(db());
    const t3 = insertTransaction(db());
    const a = person('A', '9000000001');
    createSplit({ transactionId: t1.id, shares: [{ personId: a.id, amountMinor: 100 }] });
    createSplit({ transactionId: t3.id, shares: [{ personId: a.id, amountMinor: 100 }] });
    const m = splitsForTransactions([t1.id, t2.id, t3.id]);
    expect([...m.keys()].sort()).toEqual([t1.id, t3.id].sort());
    expect(splitsForTransactions([]).size).toBe(0);
  });
});
