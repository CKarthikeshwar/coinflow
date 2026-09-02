import { getTableName, type Table } from 'drizzle-orm';

import {
  countTransactionsForCategory,
  createCategory,
  deleteCategory,
  DuplicateCategoryNameError,
  ProtectedCategoryError,
  reorderCategories,
  updateCategory,
} from './categories';

const mockInsertedRows: Record<string, unknown>[] = [];
const mockUpdates: { table: string; values: Record<string, unknown> }[] = [];
const mockDeletes: string[] = [];

const state = {
  nameTakenRow: null as { id: string } | null,
  maxOrderRow: { v: 0 } as { v: number },
  categoryRow: null as { id: string; isProtected: boolean } | null,
  txnCountRow: { n: 0 } as { n: number },
  deleteChanges: 0,
};

function respondFor(cols?: Record<string, unknown>) {
  const key = cols ? Object.keys(cols)[0] : undefined;
  if (key === 'id') return state.nameTakenRow;
  if (key === 'v') return state.maxOrderRow;
  if (key === 'n') return state.txnCountRow;
  return state.categoryRow;
}

function makeDb() {
  const db = {
    select: (cols?: Record<string, unknown>) => ({
      from: (_table: Table) => ({
        get: () => respondFor(cols),
        where: () => ({ get: () => respondFor(cols) }),
      }),
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
          return { run: () => ({ changes: state.deleteChanges }) };
        },
      }),
    }),
    delete: (table: Table) => ({
      where: () => {
        mockDeletes.push(getTableName(table));
        return { run: () => ({ changes: 1 }) };
      },
    }),
    transaction: (cb: (tx: unknown) => void) => cb(db),
  };
  return db;
}

jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'new-cat-id') }));
jest.mock('../client', () => ({ get db() { return mockDb; } }));

let mockDb: ReturnType<typeof makeDb>;

beforeEach(() => {
  mockInsertedRows.length = 0;
  mockUpdates.length = 0;
  mockDeletes.length = 0;
  state.nameTakenRow = null;
  state.maxOrderRow = { v: 0 };
  state.categoryRow = null;
  state.txnCountRow = { n: 0 };
  state.deleteChanges = 0;
  mockDb = makeDb();
});

describe('createCategory', () => {
  it('creates a category with the next order and trimmed name', () => {
    state.maxOrderRow = { v: 3 };
    const cat = createCategory({ name: '  Groceries  ', icon: 'shopping-basket' });
    expect(cat).toEqual(
      expect.objectContaining({ id: 'new-cat-id', name: 'Groceries', icon: 'shopping-basket', order: 4, kind: 'custom' }),
    );
    expect(mockInsertedRows[0]).toEqual(expect.objectContaining({ name: 'Groceries', order: 4 }));
  });

  it('rejects a duplicate name (IMP-019)', () => {
    state.nameTakenRow = { id: 'existing-cat' };
    expect(() => createCategory({ name: 'Food', icon: 'utensils' })).toThrow(DuplicateCategoryNameError);
    expect(mockInsertedRows).toHaveLength(0);
  });
});

describe('updateCategory', () => {
  it('rejects renaming to a name already used by another category', () => {
    state.nameTakenRow = { id: 'some-other-cat' };
    expect(() => updateCategory('cat-1', { name: 'Food' })).toThrow(DuplicateCategoryNameError);
    expect(mockUpdates).toHaveLength(0);
  });

  it('allows keeping its own current name (nameTaken excludes its own id)', () => {
    // nameTaken(name, exceptId) returns false when the only match is the row being edited —
    // simulated here by the mock simply having no conflicting row.
    state.nameTakenRow = null;
    updateCategory('cat-1', { name: 'Food' });
    expect(mockUpdates[0]).toEqual(
      expect.objectContaining({ table: 'category', values: expect.objectContaining({ name: 'Food' }) }),
    );
  });

  it('only patches the fields provided', () => {
    updateCategory('cat-1', { icon: 'tag' });
    expect(mockUpdates[0].values).not.toHaveProperty('name');
    expect(mockUpdates[0].values).toEqual(expect.objectContaining({ icon: 'tag' }));
  });
});

describe('countTransactionsForCategory', () => {
  it('returns the row count', () => {
    state.txnCountRow = { n: 7 };
    expect(countTransactionsForCategory('cat-1')).toBe(7);
  });

  it('returns 0 when the query yields no row', () => {
    state.txnCountRow = undefined as never;
    expect(countTransactionsForCategory('cat-1')).toBe(0);
  });
});

describe('deleteCategory', () => {
  it('reassigns transactions to Uncategorized then deletes the category (IMP-018)', () => {
    state.categoryRow = { id: 'cat-1', isProtected: false };
    state.deleteChanges = 5;
    const result = deleteCategory('cat-1');
    expect(result).toEqual({ reassigned: 5 });
    expect(mockUpdates[0]).toEqual(
      expect.objectContaining({ table: 'transaction', values: expect.objectContaining({ categoryId: null }) }),
    );
    expect(mockDeletes).toContain('category');
  });

  it('throws and deletes nothing for a protected category (Other/Uncategorized, IMP-017)', () => {
    state.categoryRow = { id: 'cat-other', isProtected: true };
    expect(() => deleteCategory('cat-other')).toThrow(ProtectedCategoryError);
    expect(mockDeletes).toHaveLength(0);
    expect(mockUpdates).toHaveLength(0);
  });

  it('no-ops for a category that no longer exists', () => {
    state.categoryRow = null;
    expect(deleteCategory('gone')).toEqual({ reassigned: 0 });
    expect(mockDeletes).toHaveLength(0);
  });
});

describe('reorderCategories', () => {
  it('writes each id its new index as order, in the given sequence', () => {
    reorderCategories(['c3', 'c1', 'c2']);
    const orders = mockUpdates.map((u) => u.values.order);
    expect(orders).toEqual([0, 1, 2]);
  });
});
