import { getTableName, type Table } from 'drizzle-orm';

import type { Transaction } from '../schema';
import {
  getTransaction,
  hasDedupeKey,
  insertTransaction,
  purgeDeleted,
  restoreTransaction,
  softDeleteTransaction,
  updateTransaction,
} from './transactions';

const mockInsertedRows: Record<string, unknown>[] = [];
const mockUpdates: { table: string; values: Record<string, unknown> }[] = [];
const mockDeletes: { table: string }[] = [];

const state = {
  txnRow: null as Partial<Transaction> | null,
  dedupeInTxn: false,
  dedupeInSuggestion: false,
};

function makeDb() {
  const db = {
    select: (cols?: Record<string, unknown>) => ({
      from: (table: Table) => {
        const tableName = getTableName(table);
        const respond = () => {
          if (cols && Object.keys(cols)[0] === 'id') {
            if (tableName === 'transaction') return state.dedupeInTxn ? { id: 'x' } : undefined;
            if (tableName === 'suggestion') return state.dedupeInSuggestion ? { id: 'y' } : undefined;
          }
          return state.txnRow;
        };
        return { get: () => respond(), where: () => ({ get: () => respond() }) };
      },
    }),
    insert: (table: Table) => ({
      values: (row: Record<string, unknown>) => {
        mockInsertedRows.push({ ...row, __table: getTableName(table) });
        return { run: () => ({ changes: 1 }) };
      },
    }),
    update: (table: Table) => ({
      set: (values: Record<string, unknown>) => ({
        where: () => {
          mockUpdates.push({ table: getTableName(table), values });
          return { run: () => ({ changes: 1 }) };
        },
      }),
    }),
    delete: (table: Table) => ({
      where: () => {
        mockDeletes.push({ table: getTableName(table) });
        return { run: () => ({ changes: 1 }) };
      },
    }),
  };
  return db;
}

let mockDb: ReturnType<typeof makeDb>;
jest.mock('../client', () => ({ get db() { return mockDb; } }));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'new-txn-id') }));

beforeEach(() => {
  mockInsertedRows.length = 0;
  mockUpdates.length = 0;
  mockDeletes.length = 0;
  state.txnRow = null;
  state.dedupeInTxn = false;
  state.dedupeInSuggestion = false;
  mockDb = makeDb();
});

function baseInput() {
  return {
    amountMinor: 45000,
    direction: 'debit' as const,
    occurredAt: 1_700_000_000_000,
    source: 'manual' as const,
  };
}

describe('insertTransaction', () => {
  it('derives type from direction and trims/nulls blank text fields', () => {
    const row = insertTransaction({ ...baseInput(), account: '  ', note: '  ', description: '  ' });
    expect(row).toEqual(
      expect.objectContaining({ type: 'expense', account: null, note: null, description: null, editedByUser: false }),
    );
  });

  it('forces categoryId null for income even if one was passed (IMP-011)', () => {
    const row = insertTransaction({ ...baseInput(), direction: 'credit', categoryId: 'cat-food' });
    expect(row.type).toBe('income');
    expect(row.categoryId).toBeNull();
  });

  it('normalizes a non-blank account and builds searchText from note/description/account', () => {
    const row = insertTransaction({ ...baseInput(), account: 'Swiggy Ltd', note: 'Lunch' });
    expect(row.normalizedAccountKey).toBe('swiggy ltd');
    expect(row.searchText).toContain('lunch');
    expect(row.searchText).toContain('swiggy ltd');
  });
});

describe('updateTransaction', () => {
  it('no-ops when the transaction no longer exists', () => {
    state.txnRow = null;
    updateTransaction('gone', { amountMinor: 100 });
    expect(mockUpdates).toHaveLength(0);
  });

  it('forces categoryId null when the patched direction makes it income', () => {
    state.txnRow = { id: 'txn-1', direction: 'debit', type: 'expense', categoryId: 'cat-food', account: null, note: null, description: null };
    updateTransaction('txn-1', { direction: 'credit', categoryId: 'cat-food' });
    expect(mockUpdates[0].values).toEqual(expect.objectContaining({ type: 'income', categoryId: null }));
  });

  it('always marks editedByUser true and bumps updatedAt', () => {
    state.txnRow = { id: 'txn-1', direction: 'debit', type: 'expense', categoryId: null, account: null, note: null, description: null };
    updateTransaction('txn-1', { amountMinor: 999 });
    expect(mockUpdates[0].values).toEqual(expect.objectContaining({ editedByUser: true }));
    expect(typeof mockUpdates[0].values.updatedAt).toBe('number');
  });

  it('leaves an unpatched field at its current value', () => {
    state.txnRow = { id: 'txn-1', direction: 'debit', type: 'expense', categoryId: null, account: 'Swiggy', note: 'Lunch', description: null };
    updateTransaction('txn-1', { amountMinor: 999 });
    expect(mockUpdates[0].values).toEqual(expect.objectContaining({ account: 'Swiggy', note: 'Lunch' }));
  });

  it('re-derives normalizedAccountKey and searchText when account/note change', () => {
    state.txnRow = { id: 'txn-1', direction: 'debit', type: 'expense', categoryId: null, account: 'Old', note: null, description: null };
    updateTransaction('txn-1', { account: 'Zomato', note: 'Dinner' });
    expect(mockUpdates[0].values).toEqual(
      expect.objectContaining({ normalizedAccountKey: 'zomato', searchText: expect.stringContaining('dinner') }),
    );
  });
});

describe('softDeleteTransaction / restoreTransaction', () => {
  it('sets deletedAt on soft delete', () => {
    softDeleteTransaction('txn-1');
    expect(mockUpdates[0].values).toEqual(expect.objectContaining({ deletedAt: expect.any(Number) }));
  });

  it('clears deletedAt on restore', () => {
    restoreTransaction('txn-1');
    expect(mockUpdates[0].values).toEqual(expect.objectContaining({ deletedAt: null }));
  });
});

describe('purgeDeleted', () => {
  it('issues a delete against the transaction table', () => {
    purgeDeleted(Date.now());
    expect(mockDeletes).toEqual([{ table: 'transaction' }]);
  });
});

describe('getTransaction', () => {
  it('returns the row, or null when none exists', () => {
    state.txnRow = { id: 'txn-1' };
    expect(getTransaction('txn-1')).toEqual({ id: 'txn-1' });
    state.txnRow = null;
    expect(getTransaction('gone')).toBeNull();
  });
});

describe('hasDedupeKey', () => {
  it('is false when the key exists in neither table', () => {
    expect(hasDedupeKey('key-1')).toBe(false);
  });

  it('is true when the key is already on a transaction', () => {
    state.dedupeInTxn = true;
    expect(hasDedupeKey('key-1')).toBe(true);
  });

  it('is true when the key is on a pending suggestion (checks both tables)', () => {
    state.dedupeInSuggestion = true;
    expect(hasDedupeKey('key-1')).toBe(true);
  });
});
