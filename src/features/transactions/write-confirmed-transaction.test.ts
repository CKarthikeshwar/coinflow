import { getTableName, type Table } from 'drizzle-orm';

import type { AddSheetDraft } from '@/stores/add-sheet-draft';

import { writeConfirmedTransaction } from './write-confirmed-transaction';

const mockInsertedRows: Record<string, unknown>[] = [];
const mockUpdates: { table: string; values: Record<string, unknown> }[] = [];
const mockExistingRule: { current: Record<string, unknown> | null } = { current: null };

function mockMakeTx() {
  return {
    insert: (table: Table) => ({
      values: (v: Record<string, unknown>) => {
        mockInsertedRows.push({ ...v, __table: getTableName(table) });
        return { run: () => ({ changes: 1 }) };
      },
    }),
    update: (table: Table) => ({
      set: (v: Record<string, unknown>) => ({
        where: () => {
          mockUpdates.push({ table: getTableName(table), values: v });
          return { run: () => ({ changes: 1 }) };
        },
      }),
    }),
    select: () => ({
      from: () => ({
        where: () => ({
          get: () => mockExistingRule.current,
        }),
      }),
    }),
  };
}

jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'new-txn-id') }));
jest.mock('@/db/client', () => ({
  db: { transaction: jest.fn((cb: (tx: unknown) => void) => cb(mockMakeTx())) },
}));

function draft(overrides: Partial<AddSheetDraft> = {}): AddSheetDraft {
  return {
    mode: 'confirm',
    sourceId: 'sug-1',
    amountMinor: 45000,
    direction: 'debit',
    type: 'expense',
    categoryId: 'cat-food',
    paymentMethod: 'upi',
    account: 'Swiggy',
    note: 'Lunch',
    description: '',
    occurredAt: 1_700_000_000_000,
    dirty: true,
    submitting: false,
    error: null,
    ...overrides,
  };
}

beforeEach(() => {
  mockInsertedRows.length = 0;
  mockUpdates.length = 0;
  mockExistingRule.current = null;
});

describe('writeConfirmedTransaction', () => {
  it('inserts the transaction with the draft fields', () => {
    writeConfirmedTransaction(draft(), null);
    const txn = mockInsertedRows.find((r) => r.__table === 'transaction');
    expect(txn).toEqual(
      expect.objectContaining({
        id: 'new-txn-id',
        amountMinor: 45000,
        direction: 'debit',
        type: 'expense',
        categoryId: 'cat-food',
        account: 'Swiggy',
        note: 'Lunch',
        source: 'manual',
        editedByUser: true,
      }),
    );
  });

  it('carries the sms ref and source=sms when confirming a detected suggestion', () => {
    writeConfirmedTransaction(
      draft(),
      { sender: 'AD-HDFCBK-S', receivedAt: 1_700_000_000_000, dedupeKey: 'dedupe-1' },
    );
    const txn = mockInsertedRows.find((r) => r.__table === 'transaction');
    expect(txn).toEqual(
      expect.objectContaining({ source: 'sms', smsSender: 'AD-HDFCBK-S', dedupeKey: 'dedupe-1' }),
    );
  });

  it('confirms the source Suggestion when mode is confirm', () => {
    writeConfirmedTransaction(draft({ sourceId: 'sug-1' }), null);
    expect(mockUpdates).toContainEqual(
      expect.objectContaining({
        table: 'suggestion',
        values: expect.objectContaining({ status: 'confirmed', confirmedTransactionId: 'new-txn-id' }),
      }),
    );
  });

  it('does not touch the suggestion table in add mode', () => {
    writeConfirmedTransaction(draft({ mode: 'add', sourceId: undefined }), null);
    expect(mockUpdates.some((u) => u.table === 'suggestion')).toBe(false);
  });

  it('forces categoryId null for income (IMP-011)', () => {
    writeConfirmedTransaction(draft({ direction: 'credit', type: 'income' }), null);
    const txn = mockInsertedRows.find((r) => r.__table === 'transaction');
    expect(txn?.categoryId).toBeNull();
  });

  it('creates a new AccountRule when none exists for this account', () => {
    mockExistingRule.current = null;
    writeConfirmedTransaction(draft({ account: 'New Cafe' }), null);
    const rule = mockInsertedRows.find((r) => r.__table === 'account_rule');
    expect(rule).toEqual(expect.objectContaining({ displayAccount: 'New Cafe', hitCount: 1 }));
  });

  it('bumps an existing AccountRule and keeps its category when the save is Uncategorized', () => {
    mockExistingRule.current = { normalizedKey: 'swiggy', categoryId: 'cat-food', hitCount: 3 };
    writeConfirmedTransaction(draft({ account: 'Swiggy', categoryId: null }), null);
    const update = mockUpdates.find((u) => u.table === 'account_rule');
    expect(update?.values).toEqual(expect.objectContaining({ hitCount: 4, categoryId: 'cat-food' }));
  });

  it('does not touch account rules when the account field is blank', () => {
    writeConfirmedTransaction(draft({ account: '' }), null);
    expect(mockInsertedRows.some((r) => r.__table === 'account_rule')).toBe(false);
    expect(mockUpdates.some((u) => u.table === 'account_rule')).toBe(false);
  });
});
