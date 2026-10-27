/**
 * IMP-073 / IMP-074 / IMP-096 — the analytics SQL uses *effective* amounts (what a transaction cost you /
 * how much of a credit is really income), and is **identical to V1** when there are no splits.
 *
 * Runs the real queries against a real in-memory SQLite (see `test-support/memory-db.ts`).
 */

import { eq } from 'drizzle-orm';

import { monthPeriod, type Period } from '@/domain/period';

import { categories, myAccounts, transactions } from '../schema';
import { insertTransaction } from '../test-support/fixtures';
import { createMemoryDb } from '../test-support/memory-db';
import { NO_ACCOUNT_ID, UNCATEGORIZED_ID } from '@/domain/analytics-filter';

import {
  accountTotalsQuery,
  categoryBreakdownQuery,
  dailyExpenseRowsQuery,
  largestExpensesQuery,
  monthlyRowsQuery,
  periodSummaryQuery,
  runningBalanceQuery,
} from './analytics';
import { findOrCreatePerson } from './persons';
import { acceptRequest, receiveRequest } from './split-requests';
import { settle } from './settlements';
import { createSplit, waiveShare } from './splits';

let mockMem: ReturnType<typeof createMemoryDb>;
let mockCounter = 0;
jest.mock('../client', () => ({
  get db() {
    return mockMem.db;
  },
}));
jest.mock('@/hooks/use-live-query', () => ({ useLiveQuery: jest.fn() }));
jest.mock('expo-crypto', () => ({
  randomUUID: () => `id-${++mockCounter}`,
  getRandomBytes: (n: number) => Uint8Array.from({ length: n }, (_v, i) => (mockCounter * 53 + i * 29) % 256),
}));

const db = () => mockMem.db;
const NOW = new Date(2026, 8, 15, 12).getTime(); // 15 Sep 2026
const period: Period = monthPeriod(NOW);
const inMonth = (day: number) => new Date(2026, 8, day, 10).getTime();
const person = (name: string, phone: string) => findOrCreatePerson({ displayName: name, phone, source: 'manual' }, 1);

function expense(amountMinor: number, extra: Partial<typeof transactions.$inferInsert> = {}) {
  return insertTransaction(db(), { direction: 'debit', type: 'expense', amountMinor, occurredAt: inMonth(10), ...extra });
}
function income(amountMinor: number, extra: Partial<typeof transactions.$inferInsert> = {}) {
  return insertTransaction(db(), { direction: 'credit', type: 'income', amountMinor, occurredAt: inMonth(11), ...extra });
}

const summary = () => periodSummaryQuery(period).get()!;
const balance = () => runningBalanceQuery().get()!.balanceMinor;

beforeEach(() => {
  mockMem?.close();
  mockMem = createMemoryDb();
  mockCounter = 0;
  db().insert(categories).values([
    { id: 'c-food', key: 'food', name: 'Food', icon: 'x', kind: 'default', appliesTo: 'expense', isProtected: false, order: 1, createdAt: 1, updatedAt: 1 },
    { id: 'c-cab', key: 'cab', name: 'Cab', icon: 'x', kind: 'default', appliesTo: 'expense', isProtected: false, order: 2, createdAt: 1, updatedAt: 1 },
  ]).run();
});

/** The V1 queries, verbatim — the reference the new SQL must equal when nothing is split. */
function legacy() {
  const raw = mockMem.raw;
  const spent = raw
    .prepare(
      `SELECT COALESCE(SUM(CASE WHEN type='expense' THEN amountMinor END),0) AS spentMinor,
              COALESCE(SUM(CASE WHEN type='income' THEN amountMinor END),0) AS incomeMinor
         FROM "transaction" WHERE deletedAt IS NULL AND occurredAt >= ? AND occurredAt < ?`,
    )
    .get(period.startMs, period.endMsExclusive) as { spentMinor: number; incomeMinor: number };
  const bal = raw
    .prepare(`SELECT COALESCE(SUM(CASE type WHEN 'income' THEN amountMinor WHEN 'expense' THEN -amountMinor END),0) AS b FROM "transaction" WHERE deletedAt IS NULL`)
    .get() as { b: number };
  const cats = raw
    .prepare(
      `SELECT categoryId, COALESCE(SUM(amountMinor),0) AS amountMinor, count(*) AS n FROM "transaction"
        WHERE deletedAt IS NULL AND type='expense' AND occurredAt >= ? AND occurredAt < ? GROUP BY categoryId ORDER BY SUM(amountMinor) DESC`,
    )
    .all(period.startMs, period.endMsExclusive);
  const largest = raw
    .prepare(
      `SELECT id, amountMinor FROM "transaction" WHERE deletedAt IS NULL AND type='expense' AND occurredAt >= ? AND occurredAt < ?
        ORDER BY amountMinor DESC, occurredAt DESC LIMIT 5`,
    )
    .all(period.startMs, period.endMsExclusive);
  const daily = raw
    .prepare(`SELECT occurredAt, amountMinor FROM "transaction" WHERE deletedAt IS NULL AND type='expense' AND occurredAt >= ? AND occurredAt < ?`)
    .all(period.startMs, period.endMsExclusive);
  return { spent, bal: bal.b, cats, largest, daily };
}

describe('V1 parity — no splits anywhere (IMP-073)', () => {
  it('every query returns exactly what the V1 SQL returns on a varied dataset', () => {
    // a deterministic spread: expenses/incomes across categories, days, an old month, a deleted row, a transfer type
    let seed = 12345;
    const rnd = () => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 0x100000000;
    for (let i = 0; i < 60; i++) {
      const isExpense = rnd() < 0.7;
      insertTransaction(db(), {
        direction: isExpense ? 'debit' : 'credit',
        type: isExpense ? 'expense' : 'income',
        amountMinor: 100 + Math.floor(rnd() * 500_000),
        categoryId: isExpense ? [null, 'c-food', 'c-cab'][Math.floor(rnd() * 3)] : null,
        occurredAt: inMonth(1 + Math.floor(rnd() * 28)),
      });
    }
    insertTransaction(db(), { amountMinor: 777, type: 'expense', direction: 'debit', occurredAt: new Date(2026, 6, 3).getTime() }); // July
    insertTransaction(db(), { amountMinor: 555, type: 'expense', direction: 'debit', occurredAt: inMonth(5), deletedAt: 1 }); // soft-deleted
    insertTransaction(db(), { amountMinor: 999, type: 'transfer', direction: 'debit', occurredAt: inMonth(6) }); // reserved type

    const ref = legacy();
    expect(summary()).toEqual(ref.spent);
    expect(balance()).toBe(ref.bal);
    expect(categoryBreakdownQuery(period).all()).toEqual(ref.cats);
    expect(largestExpensesQuery(period).all().map((r) => ({ id: r.id, amountMinor: r.amountMinor }))).toEqual(ref.largest);
    expect(dailyExpenseRowsQuery(period).all()).toEqual(ref.daily);
  });

  it('an empty database gives zeros, not nulls', () => {
    expect(summary()).toEqual({ spentMinor: 0, incomeMinor: 0 });
    expect(balance()).toBe(0);
    expect(categoryBreakdownQuery(period).all()).toEqual([]);
  });
});

describe('a shared expense counts only your share (IMP-073)', () => {
  it('₹1,200 dinner split with two people: Spent = your ₹600, not ₹1,200', () => {
    const t = expense(120_000, { categoryId: 'c-food', note: 'Dinner' });
    const a = person('A', '9000000001');
    const b = person('B', '9000000002');
    createSplit({ transactionId: t.id, shares: [{ personId: a.id, amountMinor: 30_000 }, { personId: b.id, amountMinor: 30_000 }] });
    expect(summary().spentMinor).toBe(60_000);
    expect(balance()).toBe(-60_000);
    expect(categoryBreakdownQuery(period).all()).toEqual([{ categoryId: 'c-food', amountMinor: 60_000, n: 1 }]);
    expect(dailyExpenseRowsQuery(period).all()).toEqual([{ occurredAt: inMonth(10), amountMinor: 60_000 }]);
  });

  it('the "biggest expenses" list ranks and shows the effective amount, keeping the real row otherwise intact', () => {
    const big = expense(120_000, { note: 'Dinner' });
    expense(50_000, { note: 'Groceries', occurredAt: inMonth(12) });
    const a = person('A', '9000000001');
    createSplit({ transactionId: big.id, shares: [{ personId: a.id, amountMinor: 90_000 }] }); // you paid ₹300 net
    const rows = largestExpensesQuery(period).all();
    expect(rows.map((r) => [r.note, r.amountMinor])).toEqual([['Groceries', 50_000], ['Dinner', 30_000]]);
    expect(rows[1]).toMatchObject({ id: big.id, direction: 'debit', type: 'expense' }); // full transaction shape preserved
  });

  it('a waived share is absorbed by you', () => {
    const t = expense(90_000);
    const a = person('A', '9000000001');
    const b = person('B', '9000000002');
    const v = createSplit({ transactionId: t.id, shares: [{ personId: a.id, amountMinor: 30_000 }, { personId: b.id, amountMinor: 30_000 }] });
    expect(summary().spentMinor).toBe(30_000);
    waiveShare(v.shares[0].id);
    expect(summary().spentMinor).toBe(60_000);
  });

  it('settling a share does not change what you spent (a receivable is not spending)', () => {
    const t = expense(120_000);
    const a = person('A', '9000000001');
    const v = createSplit({ transactionId: t.id, shares: [{ personId: a.id, amountMinor: 30_000 }] });
    const before = summary().spentMinor;
    settle({ transactionId: income(30_000).id, picks: [{ shareId: v.shares[0].id }] });
    expect(summary().spentMinor).toBe(before);
    expect(before).toBe(90_000);
  });

  it('a fully covered expense (your share ₹0) leaves the lists and counts as ₹0 spent', () => {
    const t = expense(60_000, { categoryId: 'c-cab' });
    const a = person('A', '9000000001');
    createSplit({ transactionId: t.id, shares: [{ personId: a.id, amountMinor: 60_000 }] });
    expect(summary().spentMinor).toBe(0);
    expect(categoryBreakdownQuery(period).all()).toEqual([]);
    expect(largestExpensesQuery(period).all()).toEqual([]);
    expect(dailyExpenseRowsQuery(period).all()).toEqual([]);
  });

  it('a soft-deleted split transaction contributes nothing (Undo restores it)', () => {
    const t = expense(120_000);
    const a = person('A', '9000000001');
    createSplit({ transactionId: t.id, shares: [{ personId: a.id, amountMinor: 30_000 }] });
    db().update(transactions).set({ deletedAt: 5 }).where(eq(transactions.id, t.id)).run();
    expect(summary().spentMinor).toBe(0);
    db().update(transactions).set({ deletedAt: null }).where(eq(transactions.id, t.id)).run();
    expect(summary().spentMinor).toBe(90_000);
  });
});

describe('income that settled a share is not income (IMP-074)', () => {
  function setup() {
    const t = expense(120_000);
    const a = person('A', '9000000001');
    const v = createSplit({ transactionId: t.id, shares: [{ personId: a.id, amountMinor: 30_000 }] });
    return { shareId: v.shares[0].id };
  }

  it('a credit fully used to settle a share counts ₹0 income', () => {
    const { shareId } = setup();
    settle({ transactionId: income(30_000).id, picks: [{ shareId }] });
    expect(summary().incomeMinor).toBe(0);
  });

  it('a larger credit counts only its unused part', () => {
    const { shareId } = setup();
    settle({ transactionId: income(50_000).id, picks: [{ shareId }] });
    expect(summary().incomeMinor).toBe(20_000);
  });

  it('an ordinary credit, and a credit that settled nothing, count in full', () => {
    setup();
    income(40_000);
    expect(summary().incomeMinor).toBe(40_000);
  });

  it('Balance = Income − Spent stays consistent after the whole story (IMP-096)', () => {
    // ₹1,200 dinner, ₹300 share owed by A; A pays ₹300; salary ₹10,000
    const { shareId } = setup();
    income(1_000_000);
    settle({ transactionId: income(30_000).id, picks: [{ shareId }] });
    const s = summary();
    expect(s.spentMinor).toBe(90_000);
    expect(s.incomeMinor).toBe(1_000_000);
    expect(balance()).toBe(s.incomeMinor - s.spentMinor);
  });
});

describe('paying a request you owe is a real expense (IMP-074)', () => {
  it('a debit settling a received request is NOT reduced', () => {
    const r = receiveRequest({ fromPhone: '9742590888', ref: 'ab2cd3', amountMinor: 45_000, note: 'Momos' }, 1000);
    if (r.kind !== 'created') throw new Error('setup');
    acceptRequest(r.request.id);
    const d = expense(45_000);
    settle({ transactionId: d.id, picks: [{ requestId: r.request.id }] });
    expect(summary().spentMinor).toBe(45_000);
    expect(balance()).toBe(-45_000);
  });
});

describe('period boundaries and other periods', () => {
  it('only counts transactions inside the period, split or not', () => {
    const inside = expense(100_000, { occurredAt: inMonth(2) });
    const outside = expense(100_000, { occurredAt: new Date(2026, 7, 20).getTime() });
    const a = person('A', '9000000001');
    createSplit({ transactionId: inside.id, shares: [{ personId: a.id, amountMinor: 40_000 }] });
    createSplit({ transactionId: outside.id, shares: [{ personId: a.id, amountMinor: 40_000 }] });
    expect(summary().spentMinor).toBe(60_000);
    expect(balance()).toBe(-120_000); // all-time balance counts both
  });
});

describe('income categories (CR-28)', () => {
  it('the income breakdown groups income by its category, with uncategorized income as its own null row', () => {
    db().insert(categories).values({ id: 'c-salary', key: 'salary', name: 'Salary', icon: 'briefcase', kind: 'default', appliesTo: 'income', isProtected: false, order: 10 }).run();
    income(300_000, { categoryId: 'c-salary' });
    income(200_000, { categoryId: 'c-salary', occurredAt: inMonth(12) });
    income(50_000); // uncategorized
    expense(70_000, { categoryId: 'c-food' }); // an expense must not leak into the income breakdown
    expect(categoryBreakdownQuery(period, 'income').all()).toEqual([
      { categoryId: 'c-salary', amountMinor: 500_000, n: 2 },
      { categoryId: null, amountMinor: 50_000, n: 1 },
    ]);
  });

  it('the expense breakdown ignores categorized income', () => {
    db().insert(categories).values({ id: 'c-salary', key: 'salary', name: 'Salary', icon: 'briefcase', kind: 'default', appliesTo: 'income', isProtected: false, order: 10 }).run();
    income(300_000, { categoryId: 'c-salary' });
    expense(70_000, { categoryId: 'c-food' });
    expect(categoryBreakdownQuery(period).all()).toEqual([{ categoryId: 'c-food', amountMinor: 70_000, n: 1 }]);
  });

  it('categorizing income does not change the period totals or the running balance', () => {
    income(300_000);
    expense(70_000);
    const before = { s: summary(), b: balance() };
    db().insert(categories).values({ id: 'c-salary', key: 'salary', name: 'Salary', icon: 'briefcase', kind: 'default', appliesTo: 'income', isProtected: false, order: 10 }).run();
    db().update(transactions).set({ categoryId: 'c-salary' }).where(eq(transactions.type, 'income')).run();
    expect(summary()).toEqual(before.s);
    expect(balance()).toBe(before.b);
  });
});

describe('Analytics filters (CR-27) — real SQL', () => {
  beforeEach(() => {
    db().insert(myAccounts).values([
      { id: 'a-bank', kind: 'bank', nickname: 'Canara ··672', createdAt: 1, updatedAt: 1 },
      { id: 'a-card', kind: 'credit_card', nickname: 'HDFC Card', createdAt: 2, updatedAt: 2 },
    ]).run();
    // bank: food 1000, cab 400, uncategorized 50, income 9000 (uncategorized)
    expense(1000, { accountId: 'a-bank', categoryId: 'c-food' });
    expense(400, { accountId: 'a-bank', categoryId: 'c-cab' });
    expense(50, { accountId: 'a-bank', categoryId: null });
    income(9000, { accountId: 'a-bank', categoryId: null });
    // card: food 300
    expense(300, { accountId: 'a-card', categoryId: 'c-food' });
    // no account: cab 70
    expense(70, { accountId: null, categoryId: 'c-cab' });
    // a transfer must never count, whatever the filter
    insertTransaction(db(), { direction: 'debit', type: 'transfer', amountMinor: 5000, occurredAt: inMonth(12), accountId: 'a-bank' });
  });

  const emptyFilter = { accountIds: [], hiddenExpense: [], hiddenIncome: [] };

  it('with no filter every account counts and transfers stay out', () => {
    expect(periodSummaryQuery(period, emptyFilter).get()).toEqual({ spentMinor: 1820, incomeMinor: 9000 });
  });

  it('one account', () => {
    const f = { ...emptyFilter, accountIds: ['a-bank'] };
    expect(periodSummaryQuery(period, f).get()).toEqual({ spentMinor: 1450, incomeMinor: 9000 });
    expect(largestExpensesQuery(period, 5, f).all().map((r) => r.amountMinor)).toEqual([1000, 400, 50]);
  });

  it('several accounts, and the "No account" bucket on its own or together with an account', () => {
    expect(periodSummaryQuery(period, { ...emptyFilter, accountIds: ['a-bank', 'a-card'] }).get()!.spentMinor).toBe(1750);
    expect(periodSummaryQuery(period, { ...emptyFilter, accountIds: [NO_ACCOUNT_ID] }).get()).toEqual({ spentMinor: 70, incomeMinor: 0 });
    expect(periodSummaryQuery(period, { ...emptyFilter, accountIds: [NO_ACCOUNT_ID, 'a-card'] }).get()!.spentMinor).toBe(370);
  });

  it('hiding a spending category removes it from the summary, the largest list and the daily rows — and income is untouched', () => {
    const f = { ...emptyFilter, hiddenExpense: ['c-food'] };
    expect(periodSummaryQuery(period, f).get()).toEqual({ spentMinor: 520, incomeMinor: 9000 });
    expect(largestExpensesQuery(period, 5, f).all().map((r) => r.amountMinor)).toEqual([400, 70, 50]);
    expect(dailyExpenseRowsQuery(period, f).all().reduce((n, r) => n + r.amountMinor, 0)).toBe(520);
  });

  it('hiding Uncategorized works for spending and for income separately', () => {
    expect(periodSummaryQuery(period, { ...emptyFilter, hiddenExpense: [UNCATEGORIZED_ID] }).get()).toEqual({ spentMinor: 1770, incomeMinor: 9000 });
    expect(periodSummaryQuery(period, { ...emptyFilter, hiddenIncome: [UNCATEGORIZED_ID] }).get()).toEqual({ spentMinor: 1820, incomeMinor: 0 });
  });

  it('hidden categories and an account filter combine', () => {
    const f = { accountIds: ['a-bank'], hiddenExpense: ['c-food', UNCATEGORIZED_ID], hiddenIncome: [] };
    expect(periodSummaryQuery(period, f).get()).toEqual({ spentMinor: 400, incomeMinor: 9000 });
  });

  it('the category breakdown follows the account filter but still lists hidden categories (so the eye can bring them back)', () => {
    const f = { accountIds: ['a-bank'], hiddenExpense: ['c-food'], hiddenIncome: [] };
    const rows = categoryBreakdownQuery(period, 'expense', f).all();
    expect(rows.map((r) => [r.categoryId, r.amountMinor])).toEqual([['c-food', 1000], ['c-cab', 400], [null, 50]]);
    // …whereas the "changes" variant drops them
    const changes = categoryBreakdownQuery(period, 'expense', f, true).all();
    expect(changes.map((r) => r.categoryId)).toEqual(['c-cab', null]);
  });

  it('account totals ignore the account filter, apply hidden categories, and report the No-account bucket as null', () => {
    const rows = accountTotalsQuery(period, { accountIds: ['a-bank'], hiddenExpense: ['c-food'], hiddenIncome: [] }).all();
    const by = Object.fromEntries(rows.map((r) => [r.accountId ?? 'none', [r.spentMinor, r.incomeMinor]]));
    expect(by).toEqual({ 'a-bank': [450, 9000], none: [70, 0] }); // the card's only row is a hidden Food spend, so it has no row at all
  });

  it('the six-month rows follow both filters and stay inside the window', () => {
    const f = { accountIds: ['a-bank'], hiddenExpense: ['c-food'], hiddenIncome: [] };
    const rows = monthlyRowsQuery(period, f).all();
    expect(rows.reduce((n, r) => n + (r.type === 'expense' ? r.amountMinor : 0), 0)).toBe(450);
    expect(rows.every((r) => r.type === 'expense' || r.type === 'income')).toBe(true);
  });
});
