/**
 * §46.6 transferRepo against real in-memory SQLite: manual transfers, auto-link, hints, unlink, edit / delete
 * invariants — and the regression that a transfer pair moves none of the analytics figures.
 */

import { eq } from 'drizzle-orm';

import { monthPeriod } from '@/domain/period';

import { categories, transactions, type Transaction } from '../schema';
import { insertTransaction as insertFixture } from '../test-support/fixtures';
import { createMemoryDb } from '../test-support/memory-db';
import { createAccount } from './accounts';
import {
  categoryBreakdownQuery,
  dailyExpenseRowsQuery,
  largestExpensesQuery,
  periodSummaryQuery,
  runningBalanceQuery,
} from './analytics';
import { restoreTransaction, transactionListQuery, updateTransaction } from './transactions';
import {
  acceptCardBillHint,
  createTransfer,
  dismissTransferHint,
  linkPair,
  linkTransferIfAny,
  listCardBillHints,
  listTransferHints,
  recordCardBillHint,
  softDeleteTransfer,
  unlinkTransfer,
  updateTransfer,
} from './transfers';

let mockMem: ReturnType<typeof createMemoryDb>;
let mockCounter = 0;
jest.mock('../client', () => ({
  get db() {
    return mockMem.db;
  },
}));
jest.mock('@/hooks/use-live-query', () => ({ useLiveQuery: jest.fn() }));
jest.mock('expo-crypto', () => ({ randomUUID: () => `id-${++mockCounter}` }));

const db = () => mockMem.db;
const NOW = new Date(2026, 9, 20, 12).getTime();
let sbi: string;
let hdfc: string;
let axis: string;

const get = (id: string) => db().select().from(transactions).where(eq(transactions.id, id)).get() as Transaction;

function row(overrides: Partial<typeof transactions.$inferInsert>) {
  return insertFixture(db(), { amountMinor: 1_000_000, occurredAt: NOW, source: 'sms', ...overrides });
}
const out = (o: Partial<typeof transactions.$inferInsert> = {}) => row({ direction: 'debit', type: 'expense', accountId: sbi, ...o });
const into = (o: Partial<typeof transactions.$inferInsert> = {}) =>
  row({ direction: 'credit', type: 'income', accountId: hdfc, occurredAt: NOW + 60_000, ...o });

/** D43 invariant: every peer points back and has the opposite direction. */
function assertPairsConsistent() {
  const all = db().select().from(transactions).all();
  for (const r of all) {
    if (!r.transferPeerId) continue;
    const p = all.find((x) => x.id === r.transferPeerId);
    if (!p) continue; // a dangling peer is only legal after a hard purge
    expect(p.transferPeerId).toBe(r.id);
    expect(p.direction).not.toBe(r.direction);
    expect(r.type).toBe('transfer');
    expect(r.categoryId).toBeNull();
  }
}

beforeEach(() => {
  mockMem?.close();
  mockMem = createMemoryDb();
  mockCounter = 0;
  sbi = createAccount({ kind: 'bank', nickname: 'SBI', bankName: 'SBI', last4: '1234' }).id;
  hdfc = createAccount({ kind: 'bank', nickname: 'HDFC', bankName: 'HDFC', last4: '672' }).id;
  axis = createAccount({ kind: 'bank', nickname: 'Axis', bankName: 'Axis', last4: '9911' }).id;
  db().insert(categories).values({ id: 'c-food', key: 'food', name: 'Food', icon: 'x', kind: 'default', order: 1, createdAt: 1, updatedAt: 1 }).run();
});

afterEach(assertPairsConsistent);

describe('createTransfer (UI-105)', () => {
  it('inserts a linked debit on From and credit on To', () => {
    const { outId, inId } = createTransfer({ fromId: sbi, toId: hdfc, amountMinor: 500_000, occurredAt: NOW, note: ' ATM ' });
    expect(get(outId)).toMatchObject({ direction: 'debit', accountId: sbi, type: 'transfer', transferPeerId: inId, note: 'ATM' });
    expect(get(inId)).toMatchObject({ direction: 'credit', accountId: hdfc, type: 'transfer', transferPeerId: outId });
  });

  it('refuses From = To and a zero amount', () => {
    expect(() => createTransfer({ fromId: sbi, toId: sbi, amountMinor: 1, occurredAt: NOW })).toThrow();
    expect(() => createTransfer({ fromId: sbi, toId: hdfc, amountMinor: 0, occurredAt: NOW })).toThrow();
  });
});

describe('linkTransferIfAny (D47)', () => {
  it('links the one SMS twin and clears its category', () => {
    const a = out({ categoryId: 'c-food' });
    const b = into();
    expect(linkTransferIfAny(b.id).kind).toBe('link');
    expect(get(a.id)).toMatchObject({ type: 'transfer', transferPeerId: b.id, categoryId: null });
    expect(get(b.id)).toMatchObject({ type: 'transfer', transferPeerId: a.id });
  });

  it('two candidates: nothing is written, the Review Queue offers both', () => {
    const a = out();
    const b = into();
    const c = into({ accountId: axis });
    expect(linkTransferIfAny(a.id).kind).toBe('ask');
    expect(get(a.id).type).toBe('expense');
    const hints = listTransferHints(NOW);
    expect(hints.map((h) => [h.outRow.id, h.inRow.id])).toEqual([
      [a.id, b.id],
      [a.id, c.id],
    ]);
  });

  it('manual on both sides: asks', () => {
    const a = out({ source: 'manual' });
    into({ source: 'manual' });
    expect(linkTransferIfAny(a.id).kind).toBe('ask');
    expect(listTransferHints(NOW)).toHaveLength(1);
  });

  it('a row with no account never links', () => {
    const a = out({ accountId: null });
    into();
    expect(linkTransferIfAny(a.id).kind).toBe('none');
  });

  it('"No" is remembered: no hint, and no auto-link either', () => {
    const a = out({ source: 'manual' });
    const b = into({ source: 'manual' });
    dismissTransferHint(b.id, a.id);
    expect(listTransferHints(NOW)).toEqual([]);
    db().update(transactions).set({ source: 'sms' }).where(eq(transactions.id, a.id)).run();
    expect(linkTransferIfAny(a.id).kind).toBe('none');
    expect(get(a.id).transferPeerId).toBeNull();
  });

  it('hints only look 48 h back', () => {
    out({ source: 'manual', occurredAt: NOW - 49 * 3600_000 });
    into({ source: 'manual', occurredAt: NOW - 49 * 3600_000 });
    expect(listTransferHints(NOW)).toEqual([]);
  });
});

describe('unlink / edit / delete (§46.6)', () => {
  it('Unlink returns both rows to expense / income, uncategorised, and does not re-offer them', () => {
    const { outId, inId } = createTransfer({ fromId: sbi, toId: hdfc, amountMinor: 500, occurredAt: NOW });
    unlinkTransfer(inId);
    expect(get(outId)).toMatchObject({ type: 'expense', transferPeerId: null, categoryId: null });
    expect(get(inId)).toMatchObject({ type: 'income', transferPeerId: null });
    expect(listTransferHints(NOW)).toEqual([]);
  });

  it('editing the amount of one side unlinks both', () => {
    const a = out();
    const b = into();
    linkPair(a.id, b.id);
    updateTransaction(a.id, { amountMinor: 999 });
    expect(get(a.id)).toMatchObject({ type: 'expense', transferPeerId: null, amountMinor: 999 });
    expect(get(b.id)).toMatchObject({ type: 'income', transferPeerId: null });
  });

  it('editing the account of one side unlinks both; editing the note does not', () => {
    const a = out();
    const b = into();
    linkPair(a.id, b.id);
    updateTransaction(a.id, { note: 'rent top-up' });
    expect(get(a.id).transferPeerId).toBe(b.id);
    updateTransaction(b.id, { accountId: axis });
    expect(get(a.id).transferPeerId).toBeNull();
    expect(get(b.id)).toMatchObject({ type: 'income', accountId: axis });
  });

  it('updateTransfer moves both sides together', () => {
    const { outId, inId } = createTransfer({ fromId: sbi, toId: hdfc, amountMinor: 500, occurredAt: NOW });
    updateTransfer(inId, { amountMinor: 700, occurredAt: NOW + 5, note: 'x', fromId: axis, toId: sbi });
    expect(get(outId)).toMatchObject({ amountMinor: 700, accountId: axis, occurredAt: NOW + 5, note: 'x', transferPeerId: inId });
    expect(get(inId)).toMatchObject({ amountMinor: 700, accountId: sbi, transferPeerId: outId });
  });

  it('delete removes both sides; Undo restores both', () => {
    const { outId, inId } = createTransfer({ fromId: sbi, toId: hdfc, amountMinor: 500, occurredAt: NOW });
    softDeleteTransfer(outId);
    expect(get(outId).deletedAt).not.toBeNull();
    expect(get(inId).deletedAt).toBe(get(outId).deletedAt);
    restoreTransaction(outId);
    expect(get(outId).deletedAt).toBeNull();
    expect(get(inId).deletedAt).toBeNull();
  });
});

describe('card-bill hint (UI-108)', () => {
  it('lists a saved debit whose SMS paid a card; Yes makes it a single-sided transfer', () => {
    const card = createAccount({ kind: 'credit_card', nickname: 'Card', bankName: 'HDFC', last4: '4321' }).id;
    const a = out({ dedupeKey: 'dk-1', categoryId: 'c-food' });
    recordCardBillHint('dk-1', card);
    const hints = listCardBillHints(NOW);
    expect(hints).toEqual([expect.objectContaining({ cardAccountId: card, dedupeKey: 'dk-1' })]);
    acceptCardBillHint(hints[0]);
    expect(get(a.id)).toMatchObject({ type: 'transfer', transferPeerId: null, categoryId: null });
    expect(listCardBillHints(NOW)).toEqual([]);
  });

  it('a hint for a suggestion not yet saved shows nothing', () => {
    recordCardBillHint('dk-pending', hdfc);
    expect(listCardBillHints(NOW)).toEqual([]);
  });
});

describe('analytics regression (§46.6) — a transfer pair moves no figure', () => {
  const period = monthPeriod(NOW);
  const figures = () => ({
    summary: periodSummaryQuery(period).get(),
    balance: runningBalanceQuery().get(),
    byCategory: categoryBreakdownQuery(period).all(),
    byIncome: categoryBreakdownQuery(period, 'income').all(),
    largest: largestExpensesQuery(period).all(),
    daily: dailyExpenseRowsQuery(period).all(),
  });

  it('linked (auto or manual) transfers change nothing', () => {
    out({ amountMinor: 4_500, categoryId: 'c-food', occurredAt: NOW - 3 * 3600_000 });
    into({ amountMinor: 80_000, occurredAt: NOW - 5 * 3600_000 });
    const before = figures();

    createTransfer({ fromId: sbi, toId: hdfc, amountMinor: 1_000_000, occurredAt: NOW });
    const a = out({ amountMinor: 250_000, occurredAt: NOW + 3600_000 });
    const b = into({ amountMinor: 250_000, occurredAt: NOW + 3600_000 + 60_000 });
    linkTransferIfAny(b.id);
    expect(get(a.id).type).toBe('transfer');

    expect(figures()).toEqual(before);
  });
});

describe('ledger list (UI-106) — a linked pair is one row', () => {
  // `isFtsAvailable` is never consulted without a search term
  const ids = (q: Parameters<typeof transactionListQuery>[0] = {}) => transactionListQuery(q).all().map((r) => r.id);

  it('shows the debit half only', () => {
    const { outId } = createTransfer({ fromId: sbi, toId: hdfc, amountMinor: 500, occurredAt: NOW });
    expect(ids()).toEqual([outId]);
  });

  it('filtered to the To account, the credit half shows instead', () => {
    const { outId, inId } = createTransfer({ fromId: sbi, toId: hdfc, amountMinor: 500, occurredAt: NOW });
    expect(ids({ accountIds: [hdfc] })).toEqual([inId]);
    expect(ids({ accountIds: [sbi] })).toEqual([outId]);
    expect(ids({ accountIds: [sbi, hdfc] })).toEqual([outId]);
  });

  it('a transfer is not "Uncategorized"', () => {
    createTransfer({ fromId: sbi, toId: hdfc, amountMinor: 500, occurredAt: NOW });
    const plain = out({ amountMinor: 1 });
    expect(ids({ uncategorized: true })).toEqual([plain.id]);
  });
});
