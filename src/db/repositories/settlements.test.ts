import { eq } from 'drizzle-orm';

import { settlements, transactions } from '../schema';
import { insertTransaction } from '../test-support/fixtures';
import { createMemoryDb } from '../test-support/memory-db';
import { findOrCreatePerson } from './persons';
import { acceptRequest, listOpenRequests, receiveRequest } from './split-requests';
import { allocatedFromTransaction, listSettlementsForTransaction, settle, settledByShare, unsettle } from './settlements';
import { createSplit, getSplit, waiveShare } from './splits';

let mockMem: ReturnType<typeof createMemoryDb>;
let mockCounter = 0;
jest.mock('../client', () => ({
  get db() {
    return mockMem.db;
  },
}));
jest.mock('expo-crypto', () => ({
  randomUUID: () => `id-${++mockCounter}`,
  getRandomBytes: (n: number) => Uint8Array.from({ length: n }, (_v, i) => (mockCounter * 41 + i * 13) % 256),
}));

const db = () => mockMem.db;
const person = (name: string, phone: string) => findOrCreatePerson({ displayName: name, phone, source: 'manual' }, 50);
const credit = (amountMinor: number) => insertTransaction(db(), { direction: 'credit', type: 'income', amountMinor });
const debit = (amountMinor: number) => insertTransaction(db(), { direction: 'debit', type: 'expense', amountMinor });

/** A ₹1,200 dinner split with two people, ₹300 each. */
function dinner() {
  const txn = insertTransaction(db(), { amountMinor: 120_000, note: 'Dinner' });
  const rahul = person('Rahul', '9845897555');
  const priya = person('Priya', '9742590888');
  const v = createSplit({
    transactionId: txn.id,
    shares: [
      { personId: rahul.id, amountMinor: 30_000 },
      { personId: priya.id, amountMinor: 30_000 },
    ],
  });
  return { txn, rahul, priya, v, rahulShare: v.shares[0].id, priyaShare: v.shares[1].id };
}

beforeEach(() => {
  mockMem?.close();
  mockMem = createMemoryDb();
  mockCounter = 0;
});

describe('settle — credits settle shares (IMP-074/075)', () => {
  it('settles a share in full with a credit of the same amount', () => {
    const { v, rahulShare } = dinner();
    const c = credit(30_000);
    const made = settle({ transactionId: c.id, picks: [{ shareId: rahulShare }] }, 1000);
    expect(made).toHaveLength(1);
    expect(made[0]).toMatchObject({ shareId: rahulShare, requestId: null, transactionId: c.id, amountMinor: 30_000, createdAt: 1000 });
    expect(getSplit(v.split.id)!.shares[0].state).toBe('settled');
  });

  it('settles several shares with one payment', () => {
    const { rahulShare, priyaShare, v } = dinner();
    const c = credit(60_000);
    const made = settle({ transactionId: c.id, picks: [{ shareId: rahulShare }, { shareId: priyaShare }] });
    expect(made.map((m) => m.amountMinor)).toEqual([30_000, 30_000]);
    expect(getSplit(v.split.id)!.state).toBe('settled');
  });

  it('a payment larger than what is owed only settles what is owed — the rest stays an ordinary transaction', () => {
    const { rahulShare } = dinner();
    const c = credit(50_000);
    const made = settle({ transactionId: c.id, picks: [{ shareId: rahulShare }] });
    expect(made[0].amountMinor).toBe(30_000);
    expect(allocatedFromTransaction(c.id)).toBe(30_000);
    expect(db().select().from(transactions).where(eq(transactions.id, c.id)).get()?.amountMinor).toBe(50_000); // untouched
  });

  it('a smaller payment part-settles the share; a second payment finishes it', () => {
    const { v, rahulShare } = dinner();
    settle({ transactionId: credit(10_000).id, picks: [{ shareId: rahulShare }] });
    expect(getSplit(v.split.id)!.shares[0]).toMatchObject({ state: 'partial', settledMinor: 10_000, remainingMinor: 20_000 });
    settle({ transactionId: credit(25_000).id, picks: [{ shareId: rahulShare }] });
    expect(getSplit(v.split.id)!.shares[0]).toMatchObject({ state: 'settled', settledMinor: 30_000, remainingMinor: 0 });
  });

  it('honours a requested smaller amount', () => {
    const { rahulShare } = dinner();
    const made = settle({ transactionId: credit(30_000).id, picks: [{ shareId: rahulShare, amountMinor: 12_000 }] });
    expect(made[0].amountMinor).toBe(12_000);
  });

  it('caps the second pick by what is left of the transaction', () => {
    const { rahulShare, priyaShare } = dinner();
    const c = credit(40_000);
    const made = settle({ transactionId: c.id, picks: [{ shareId: rahulShare }, { shareId: priyaShare }] });
    expect(made.map((m) => m.amountMinor)).toEqual([30_000, 10_000]);
  });

  it('accounts for what the same transaction already settled earlier', () => {
    const { rahulShare, priyaShare } = dinner();
    const c = credit(40_000);
    settle({ transactionId: c.id, picks: [{ shareId: rahulShare }] });
    const second = settle({ transactionId: c.id, picks: [{ shareId: priyaShare }] });
    expect(second[0].amountMinor).toBe(10_000);
    expect(() => settle({ transactionId: c.id, picks: [{ shareId: priyaShare }] })).toThrow('nothing to settle'); // used up
  });

  it('rejects a debit picking a share, a waived share, an unknown share, a deleted split, and an empty merge', () => {
    const { txn, rahulShare, priyaShare } = dinner();
    expect(() => settle({ transactionId: debit(30_000).id, picks: [{ shareId: rahulShare }] })).toThrow('debit can only settle requests');
    waiveShare(priyaShare);
    expect(() => settle({ transactionId: credit(30_000).id, picks: [{ shareId: priyaShare }] })).toThrow('waived');
    expect(() => settle({ transactionId: credit(30_000).id, picks: [{ shareId: 'nope' }] })).toThrow('share not found');
    expect(() => settle({ transactionId: credit(30_000).id, picks: [] })).toThrow('nothing to settle');
    db().update(transactions).set({ deletedAt: 5 }).where(eq(transactions.id, txn.id)).run();
    expect(() => settle({ transactionId: credit(30_000).id, picks: [{ shareId: rahulShare }] })).toThrow('deleted');
  });

  it('rejects settling with a deleted or unknown transaction', () => {
    const { rahulShare } = dinner();
    const c = credit(30_000);
    db().update(transactions).set({ deletedAt: 1 }).where(eq(transactions.id, c.id)).run();
    expect(() => settle({ transactionId: c.id, picks: [{ shareId: rahulShare }] })).toThrow('transaction not found');
    expect(() => settle({ transactionId: 'zzz', picks: [{ shareId: rahulShare }] })).toThrow('transaction not found');
  });

  it('is all-or-nothing (IMP-083): a bad second pick writes nothing, not even the first', () => {
    const { rahulShare } = dinner();
    const c = credit(60_000);
    expect(() => settle({ transactionId: c.id, picks: [{ shareId: rahulShare }, { shareId: 'ghost' }] })).toThrow();
    expect(db().select().from(settlements).all()).toEqual([]);
  });

  it('a hard CHECK stops a settlement row that names both / neither target', () => {
    const { rahulShare, txn } = dinner();
    const c = credit(100);
    expect(() =>
      db().insert(settlements).values({ id: 'x', shareId: rahulShare, requestId: 'also', transactionId: c.id, amountMinor: 1, createdAt: 1 }).run(),
    ).toThrow();
    expect(() => db().insert(settlements).values({ id: 'y', transactionId: txn.id, amountMinor: 1, createdAt: 1 }).run()).toThrow();
  });
});

describe('settle — debits settle requests you owe (D37)', () => {
  function acceptedRequest(amountMinor = 45_000) {
    const r = receiveRequest({ fromPhone: '+919742590888', ref: 'ab2cd3', amountMinor, note: 'Momos' }, 1000);
    if (r.kind !== 'created') throw new Error('setup failed');
    acceptRequest(r.request.id, 1001);
    return r.request;
  }

  it('a debit settles an accepted request', () => {
    const req = acceptedRequest();
    const d = debit(45_000);
    const made = settle({ transactionId: d.id, picks: [{ requestId: req.id }] });
    expect(made[0]).toMatchObject({ requestId: req.id, shareId: null, amountMinor: 45_000 });
    expect(listOpenRequests()).toEqual([]); // nothing left to pay
  });

  it('caps by the request and leaves the rest of the payment alone', () => {
    const req = acceptedRequest(45_000);
    const d = debit(100_000);
    expect(settle({ transactionId: d.id, picks: [{ requestId: req.id }] })[0].amountMinor).toBe(45_000);
  });

  it('refuses a credit picking a request, and an un-accepted request', () => {
    const req = acceptedRequest();
    expect(() => settle({ transactionId: credit(45_000).id, picks: [{ requestId: req.id }] })).toThrow('credit can only settle shares');
    const other = receiveRequest({ fromPhone: '+919845897555', ref: 'zz2zz3', amountMinor: 100 }, 2000);
    if (other.kind !== 'created') throw new Error('setup failed');
    expect(() => settle({ transactionId: debit(100).id, picks: [{ requestId: other.request.id }] })).toThrow('only an accepted request');
    expect(() => settle({ transactionId: debit(100).id, picks: [{ requestId: 'nope' }] })).toThrow('request not found');
  });
});

describe('unsettle / lists', () => {
  it('unsettle undoes a merge', () => {
    const { v, rahulShare } = dinner();
    const made = settle({ transactionId: credit(30_000).id, picks: [{ shareId: rahulShare }] });
    unsettle(made.map((m) => m.id));
    expect(getSplit(v.split.id)!.shares[0].state).toBe('pending');
    expect(() => unsettle([])).not.toThrow();
  });

  it('settledByShare returns only shares that have something settled', () => {
    const { rahulShare, priyaShare } = dinner();
    settle({ transactionId: credit(12_000).id, picks: [{ shareId: rahulShare }] });
    const m = settledByShare([rahulShare, priyaShare]);
    expect(m.get(rahulShare)).toBe(12_000);
    expect(m.has(priyaShare)).toBe(false);
  });

  it('lists what a transaction settled, with who and what (Details › Settlements)', () => {
    const { rahulShare } = dinner();
    const c = credit(50_000);
    settle({ transactionId: c.id, picks: [{ shareId: rahulShare }] }, 1234);
    expect(listSettlementsForTransaction(c.id)).toEqual([
      expect.objectContaining({ counterpartName: 'Rahul', label: 'Dinner', kind: 'share', amountMinor: 30_000, createdAt: 1234 }),
    ]);
    expect(listSettlementsForTransaction('other')).toEqual([]);
  });

  it('lists request settlements for a debit', () => {
    const r = receiveRequest({ fromPhone: '+919742590888', ref: 'ab2cd3', amountMinor: 45_000, note: 'Momos' }, 1000);
    if (r.kind !== 'created') throw new Error('setup failed');
    acceptRequest(r.request.id);
    const d = debit(45_000);
    settle({ transactionId: d.id, picks: [{ requestId: r.request.id }] });
    expect(listSettlementsForTransaction(d.id)[0]).toMatchObject({ kind: 'request', label: 'Momos', amountMinor: 45_000 });
  });
});
