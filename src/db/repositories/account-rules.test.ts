import { getTableName, type Table } from 'drizzle-orm';

import type { AccountRule } from '../schema';
import {
  deleteAccountRule,
  getAccountRule,
  searchByPrefix,
  updateAccountRule,
  upsertFromTransaction,
} from './account-rules';

const mockInsertedRows: Record<string, unknown>[] = [];
const mockUpdates: { table: string; values: Record<string, unknown> }[] = [];
const mockDeletes: string[] = [];

const state = {
  existingRule: null as Partial<AccountRule> | null,
  listRows: [] as Partial<AccountRule>[],
};

function makeDb() {
  const db = {
    select: (_cols?: Record<string, unknown>) => ({
      from: (_table: Table) => {
        const step = {
          get: () => state.existingRule,
          all: () => state.listRows,
          where: () => step,
          orderBy: () => step,
          limit: () => step,
        };
        return step;
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
        mockDeletes.push(getTableName(table));
        return { run: () => ({ changes: 1 }) };
      },
    }),
  };
  return db;
}

let mockDb: ReturnType<typeof makeDb>;
jest.mock('../client', () => ({ get db() { return mockDb; } }));

beforeEach(() => {
  mockInsertedRows.length = 0;
  mockUpdates.length = 0;
  mockDeletes.length = 0;
  state.existingRule = null;
  state.listRows = [];
  mockDb = makeDb();
});

describe('upsertFromTransaction', () => {
  it('does nothing when the account is blank', () => {
    upsertFromTransaction({ direction: 'debit', account: '   ', categoryId: null, categoryIsUncategorized: true, note: null, paymentMethod: null });
    expect(mockInsertedRows).toHaveLength(0);
    expect(mockUpdates).toHaveLength(0);
  });

  it('inserts a new rule with hitCount 1 when none exists for the normalized key', () => {
    state.existingRule = null;
    upsertFromTransaction({ direction: 'debit', account: 'Swiggy', categoryId: 'cat-food', categoryIsUncategorized: false, note: 'Lunch', paymentMethod: 'upi' });
    expect(mockInsertedRows[0]).toEqual(
      expect.objectContaining({ normalizedKey: 'swiggy', displayAccount: 'Swiggy', hitCount: 1, categoryId: 'cat-food' }),
    );
  });

  it('bumps hitCount and overwrites lastNote/lastPaymentMethod on an existing rule', () => {
    state.existingRule = { normalizedKey: 'swiggy', hitCount: 3, categoryId: 'cat-food' };
    upsertFromTransaction({ direction: 'debit', account: 'Swiggy', categoryId: 'cat-food', categoryIsUncategorized: false, note: 'Dinner', paymentMethod: 'cash' });
    expect(mockUpdates[0].values).toEqual(
      expect.objectContaining({ hitCount: 4, lastNote: 'Dinner', lastPaymentMethod: 'cash', categoryId: 'cat-food' }),
    );
  });

  it('keeps the previously learned category when the new save is Uncategorized', () => {
    state.existingRule = { normalizedKey: 'swiggy', hitCount: 3, categoryId: 'cat-food' };
    upsertFromTransaction({ direction: 'debit', account: 'Swiggy', categoryId: null, categoryIsUncategorized: true, note: null, paymentMethod: null });
    expect(mockUpdates[0].values).not.toHaveProperty('categoryId'); // untouched, so the learned one stays
  });

  it('a credit with a category is learned into incomeCategoryId, leaving the expense category alone (CR-28)', () => {
    state.existingRule = { normalizedKey: 'akarsh', hitCount: 2, categoryId: 'cat-food', incomeCategoryId: null };
    upsertFromTransaction({ direction: 'credit', account: 'Akarsh', categoryId: 'cat-refund', categoryIsUncategorized: false, note: null, paymentMethod: 'upi' });
    expect(mockUpdates[0].values).toEqual(expect.objectContaining({ incomeCategoryId: 'cat-refund' }));
    expect(mockUpdates[0].values).not.toHaveProperty('categoryId');
  });

  it('a debit with a category is learned into categoryId, leaving the income category alone (CR-28)', () => {
    state.existingRule = { normalizedKey: 'akarsh', hitCount: 2, categoryId: null, incomeCategoryId: 'cat-refund' };
    upsertFromTransaction({ direction: 'debit', account: 'Akarsh', categoryId: 'cat-food', categoryIsUncategorized: false, note: null, paymentMethod: 'upi' });
    expect(mockUpdates[0].values).toEqual(expect.objectContaining({ categoryId: 'cat-food' }));
    expect(mockUpdates[0].values).not.toHaveProperty('incomeCategoryId');
  });

  it('a brand-new rule from a credit stores the category as the income one (CR-28)', () => {
    state.existingRule = null;
    upsertFromTransaction({ direction: 'credit', account: 'Employer', categoryId: 'cat-salary', categoryIsUncategorized: false, note: null, paymentMethod: 'bank_transfer' });
    expect(mockInsertedRows[0]).toEqual(expect.objectContaining({ categoryId: null, incomeCategoryId: 'cat-salary' }));
  });

  it('an explicit null note clears lastNote (P-6), not left as-is', () => {
    state.existingRule = { normalizedKey: 'swiggy', hitCount: 1, categoryId: null };
    upsertFromTransaction({ direction: 'debit', account: 'Swiggy', categoryId: null, categoryIsUncategorized: true, note: null, paymentMethod: null });
    expect(mockUpdates[0].values).toEqual(expect.objectContaining({ lastNote: null }));
  });
});

describe('getAccountRule', () => {
  it('returns the row, or null when none exists', () => {
    state.existingRule = { normalizedKey: 'swiggy' };
    expect(getAccountRule('swiggy')).toEqual({ normalizedKey: 'swiggy' });
    state.existingRule = null;
    expect(getAccountRule('nope')).toBeNull();
  });
});

describe('searchByPrefix', () => {
  it('returns [] for a blank prefix without querying', () => {
    expect(searchByPrefix('   ')).toEqual([]);
  });

  it('returns the matching rows', () => {
    state.listRows = [{ normalizedKey: 'swiggy' }, { normalizedKey: 'swiggy2' }];
    expect(searchByPrefix('Swig')).toEqual(state.listRows);
  });
});

describe('updateAccountRule', () => {
  it('only patches fields explicitly provided', () => {
    updateAccountRule('swiggy', { lastNote: 'x' });
    expect(mockUpdates[0].values).not.toHaveProperty('categoryId');
    expect(mockUpdates[0].values).toEqual(expect.objectContaining({ lastNote: 'x' }));
  });

  it('an explicit null clears the field rather than being skipped', () => {
    updateAccountRule('swiggy', { lastNote: null });
    expect(mockUpdates[0].values).toEqual(expect.objectContaining({ lastNote: null }));
  });
});

describe('deleteAccountRule', () => {
  it('deletes the rule row', () => {
    deleteAccountRule('swiggy');
    expect(mockDeletes).toContain('account_rule');
  });
});
