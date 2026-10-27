/**
 * D50 / CR-41 — an account's balance is the sum of its own transactions from zero. Real in-memory SQLite.
 */

import { suggestions } from '../schema';
import { insertTransaction } from '../test-support/fixtures';
import { createMemoryDb } from '../test-support/memory-db';
import { createAccount, mergeAccounts } from './accounts';
import { listAccountViews, unassignedSummary } from './balances';

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
let hdfc: string;
let sbi: string;

const balanceOf = (id: string) => listAccountViews({ includeArchived: true }).find((v) => v.account.id === id)!.balanceMinor;

beforeEach(() => {
  mockMem?.close();
  mockMem = createMemoryDb();
  mockCounter = 0;
  hdfc = createAccount({ kind: 'bank', nickname: 'HDFC', bankName: 'HDFC', last4: '672' }).id;
  sbi = createAccount({ kind: 'bank', nickname: 'SBI', bankName: 'SBI', last4: '1234' }).id;
});

describe('an account balance is Σ of its transactions from zero', () => {
  it('an account with nothing recorded is ₹0 — never unknown', () => {
    expect(balanceOf(hdfc)).toBe(0);
  });

  it('credits add, debits subtract', () => {
    insertTransaction(db(), { accountId: hdfc, direction: 'credit', type: 'income', amountMinor: 10_000 });
    insertTransaction(db(), { accountId: hdfc, direction: 'debit', type: 'expense', amountMinor: 2_500 });
    insertTransaction(db(), { accountId: hdfc, direction: 'debit', type: 'expense', amountMinor: 500 });
    expect(balanceOf(hdfc)).toBe(7_000);
  });

  it('can go negative (nothing is hidden or clamped)', () => {
    insertTransaction(db(), { accountId: hdfc, direction: 'debit', type: 'expense', amountMinor: 300 });
    expect(balanceOf(hdfc)).toBe(-300);
  });

  it("only the account's own rows count — other accounts' rows and rows with no account are ignored", () => {
    insertTransaction(db(), { accountId: hdfc, direction: 'credit', type: 'income', amountMinor: 1_000 });
    insertTransaction(db(), { accountId: sbi, direction: 'credit', type: 'income', amountMinor: 9_999 });
    insertTransaction(db(), { accountId: null, direction: 'credit', type: 'income', amountMinor: 7_777 });
    expect(balanceOf(hdfc)).toBe(1_000);
    expect(balanceOf(sbi)).toBe(9_999);
  });

  it('deleted rows do not count', () => {
    insertTransaction(db(), { accountId: hdfc, direction: 'credit', type: 'income', amountMinor: 1_000 });
    insertTransaction(db(), { accountId: hdfc, direction: 'credit', type: 'income', amountMinor: 5_000, deletedAt: 1 });
    expect(balanceOf(hdfc)).toBe(1_000);
  });

  it('both legs of a transfer count, each on its own account', () => {
    insertTransaction(db(), { accountId: hdfc, direction: 'credit', type: 'income', amountMinor: 10_000 });
    insertTransaction(db(), { accountId: hdfc, direction: 'debit', type: 'transfer', amountMinor: 4_000 });
    insertTransaction(db(), { accountId: sbi, direction: 'credit', type: 'transfer', amountMinor: 4_000 });
    expect(balanceOf(hdfc)).toBe(6_000);
    expect(balanceOf(sbi)).toBe(4_000);
  });

  it('uses the full amount that moved, not the part of a shared expense that was yours', () => {
    // a ₹1,000 dinner shared with a friend: the bank still lost ₹1,000
    insertTransaction(db(), { accountId: hdfc, direction: 'credit', type: 'income', amountMinor: 5_000 });
    insertTransaction(db(), { accountId: hdfc, direction: 'debit', type: 'expense', amountMinor: 1_000 });
    expect(balanceOf(hdfc)).toBe(4_000);
  });

  it('a pending Review Queue item is not a transaction yet and is not counted', () => {
    insertTransaction(db(), { accountId: hdfc, direction: 'credit', type: 'income', amountMinor: 1_000 });
    db()
      .insert(suggestions)
      .values({
        id: 's-1',
        status: 'pending',
        accountId: hdfc,
        amountMinor: 700,
        direction: 'debit',
        occurredAt: 5,
        smsSender: 'AX-HDFCBK-S',
        smsReceivedAt: 5,
        dedupeKey: 'pending-1',
      } as typeof suggestions.$inferInsert)
      .run();
    expect(balanceOf(hdfc)).toBe(1_000);
  });

  it('a credit card goes negative as it is spent on, and back up when the bill is paid (a transfer)', () => {
    const card = createAccount({ kind: 'credit_card', nickname: 'HDFC Card', bankName: 'HDFC', last4: '4321' }).id;
    insertTransaction(db(), { accountId: card, direction: 'debit', type: 'expense', amountMinor: 14_200 });
    expect(balanceOf(card)).toBe(-14_200);
    insertTransaction(db(), { accountId: card, direction: 'credit', type: 'transfer', amountMinor: 14_200 });
    expect(balanceOf(card)).toBe(0);
  });

  it('archived accounts are left out unless asked for', () => {
    mockMem.raw.prepare('UPDATE my_account SET archivedAt = 1 WHERE id = ?').run(sbi);
    expect(listAccountViews().map((v) => v.account.id)).toEqual([hdfc]);
    expect(listAccountViews({ includeArchived: true })).toHaveLength(2);
  });
});

describe('merge moves the balance with the transactions', () => {
  it('the target account now holds both accounts’ rows', () => {
    insertTransaction(db(), { accountId: hdfc, direction: 'credit', type: 'income', amountMinor: 3_000 });
    insertTransaction(db(), { accountId: sbi, direction: 'credit', type: 'income', amountMinor: 2_000 });
    mergeAccounts(sbi, hdfc);
    expect(balanceOf(hdfc)).toBe(5_000);
  });
});

describe('D51 (CR-42) — transactions with no account', () => {
  it('nothing recorded gives 0 and 0', () => {
    expect(unassignedSummary()).toEqual({ balanceMinor: 0, count: 0 });
  });

  it('sums only live rows with no account: credits +, debits -, full amounts', () => {
    insertTransaction(db(), { accountId: null, direction: 'credit', type: 'income', amountMinor: 900_000 });
    insertTransaction(db(), { accountId: null, direction: 'debit', type: 'expense', amountMinor: 51_000 });
    insertTransaction(db(), { accountId: null, direction: 'debit', type: 'expense', amountMinor: 1_000, deletedAt: 1 });
    insertTransaction(db(), { accountId: hdfc, direction: 'credit', type: 'income', amountMinor: 7_777 });
    expect(unassignedSummary()).toEqual({ balanceMinor: 849_000, count: 2 });
    expect(balanceOf(hdfc)).toBe(7_777); // an account's own balance ignores them
  });
});
