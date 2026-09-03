import { getTableName, type Table } from 'drizzle-orm';

import type { Category } from '@/db/schema';

import { exportCsv, exportJson } from './export';

const mockTransactionRows: Record<string, unknown>[] = [];
const mockCategoryRows: Category[] = [];
const mockAccountRuleRows: Record<string, unknown>[] = [];

const mockWrite = jest.fn();
const mockCreate = jest.fn();
const mockShareAsync = jest.fn();

const TABLE_ROWS: Record<string, () => unknown[]> = {
  transaction: () => mockTransactionRows,
  category: () => mockCategoryRows,
  account_rule: () => mockAccountRuleRows,
};

// Named `mockFrom` (not inlined in the factory below) so `getTableName` — imported normally at
// the top — can be referenced from it: babel-plugin-jest-hoist only allows a `jest.mock` factory
// to reference *mock*-prefixed outer identifiers, and `mockFrom` itself qualifies even though
// `getTableName` alone wouldn't. Same pattern `write-confirmed-transaction.test.ts` already uses.
function mockFrom(table: Table) {
  const name = getTableName(table);
  const step = { where: () => step, all: () => TABLE_ROWS[name]?.() ?? [] };
  return step;
}

// Mocks `@/db/client` directly (never `jest.requireActual`) — the real module calls
// `SQLite.openDatabaseSync` at import time; there's no real native SQLite in Jest. Same fluent
// mock shape `write-confirmed-transaction.test.ts` already established, extended to route by
// table name since `export.ts` reads three different tables.
jest.mock('@/db/client', () => ({
  db: { select: () => ({ from: (table: Table) => mockFrom(table) }) },
}));

jest.mock('@/db/repositories/categories', () => ({
  getCategoryMap: () => new Map(mockCategoryRows.map((c) => [c.id, c])),
}));

jest.mock('expo-constants', () => ({ expoConfig: { version: '1.2.3' } }));

// The mock `File` class is defined inside the factory (not hoisted above it) so it can't be
// referenced out-of-scope — babel-plugin-jest-hoist only allows `mock`-prefixed outer
// identifiers inside a `jest.mock` factory.
jest.mock('expo-file-system', () => {
  class MockFile {
    uri = 'file:///cache/mock';
    create(...args: unknown[]) {
      mockCreate(...args);
    }
    write(...args: unknown[]) {
      mockWrite(...args);
    }
  }
  return { File: MockFile, Paths: { cache: {} } };
});

jest.mock('expo-sharing', () => ({ shareAsync: (...args: unknown[]) => mockShareAsync(...args) }));

function category(overrides: Partial<Category> = {}): Category {
  return {
    id: 'cat-food',
    key: null,
    name: 'Food',
    icon: 'utensils',
    kind: 'custom',
    isProtected: false,
    order: 1,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

beforeEach(() => {
  mockWrite.mockReset();
  mockCreate.mockReset();
  mockShareAsync.mockReset();
  mockTransactionRows.length = 0;
  mockCategoryRows.length = 0;
  mockAccountRuleRows.length = 0;
});

describe('exportJson', () => {
  it('writes a JSON payload with version, exportedAt, and the three live collections', async () => {
    mockTransactionRows.push({ id: 'txn-1', amountMinor: 45000, direction: 'debit' });
    mockCategoryRows.push(category());
    mockAccountRuleRows.push({ normalizedKey: 'swiggy', displayAccount: 'Swiggy' });

    await exportJson();

    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ overwrite: true }));
    const written = JSON.parse(mockWrite.mock.calls[0][0]);
    expect(written.version).toBe('1.2.3');
    expect(typeof written.exportedAt).toBe('number');
    expect(written.transactions).toEqual([{ id: 'txn-1', amountMinor: 45000, direction: 'debit' }]);
    expect(written.customCategories).toEqual([category()]);
    expect(written.accountRules).toEqual([{ normalizedKey: 'swiggy', displayAccount: 'Swiggy' }]);
  });

  it('hands the written file to the OS share sheet as JSON', async () => {
    await exportJson();
    expect(mockShareAsync).toHaveBeenCalledWith('file:///cache/mock', expect.objectContaining({ mimeType: 'application/json' }));
  });
});

describe('exportCsv', () => {
  it('writes a header row plus one row per transaction, amounts signed to 2dp', async () => {
    mockCategoryRows.push(category({ id: 'cat-food', name: 'Food' }));
    mockTransactionRows.push({
      id: 'txn-1',
      occurredAt: new Date('2026-03-05T12:30:00Z').getTime(),
      direction: 'debit',
      type: 'expense',
      amountMinor: 45050,
      categoryId: 'cat-food',
      paymentMethod: 'upi',
      account: 'Swiggy',
      note: 'Dinner',
      description: null,
      source: 'sms',
    });

    await exportCsv();

    const csv: string = mockWrite.mock.calls[0][0];
    const lines = csv.split('\n');
    expect(lines[0]).toBe('date,direction,type,amount,category,paymentMethod,account,note,description,source');
    expect(lines[1]).toContain('debit,expense,-450.50,Food,upi,Swiggy,Dinner,,sms');
  });

  it('quotes a field containing a comma', async () => {
    mockTransactionRows.push({
      id: 'txn-1',
      occurredAt: Date.now(),
      direction: 'credit',
      type: 'income',
      amountMinor: 1000,
      categoryId: null,
      paymentMethod: null,
      account: null,
      note: 'Rent, split',
      description: null,
      source: 'manual',
    });

    await exportCsv();
    const csv: string = mockWrite.mock.calls[0][0];
    expect(csv).toContain('"Rent, split"');
  });

  it('hands the written file to the OS share sheet as CSV', async () => {
    await exportCsv();
    expect(mockShareAsync).toHaveBeenCalledWith('file:///cache/mock', expect.objectContaining({ mimeType: 'text/csv' }));
  });
});
