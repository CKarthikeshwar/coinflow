import { getTableName, type Table } from 'drizzle-orm';

import type { AccountRule, Suggestion } from '@/db/schema';
import { getAccountRule } from '@/db/repositories/account-rules';
import { dismissSuggestion, getSuggestion } from '@/db/repositories/suggestions';

import { cancelForSuggestion } from './post';
import { handleDiscard, handleSave } from './respond';

const mockInsertedRows: unknown[] = [];
const mockUpdates: { table: string; values: Record<string, unknown> }[] = [];

function mockMakeTx() {
  return {
    insert: (table: Table) => ({
      values: (v: Record<string, unknown>) => {
        mockInsertedRows.push(v);
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
  };
}

jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'new-txn-id') }));
jest.mock('@/db/client', () => ({
  db: { transaction: jest.fn((cb: (tx: unknown) => void) => cb(mockMakeTx())) },
}));
jest.mock('@/db/repositories/account-rules', () => ({ getAccountRule: jest.fn() }));
jest.mock('@/db/repositories/suggestions', () => ({
  getSuggestion: jest.fn(),
  dismissSuggestion: jest.fn(),
}));
jest.mock('./post', () => ({ cancelForSuggestion: jest.fn().mockResolvedValue(undefined) }));

const getSuggestionMock = getSuggestion as jest.Mock;
const getAccountRuleMock = getAccountRule as jest.Mock;
const dismissSuggestionMock = dismissSuggestion as jest.Mock;
const cancelForSuggestionMock = cancelForSuggestion as jest.Mock;

function suggestion(overrides: Partial<Suggestion> = {}): Suggestion {
  return {
    id: 'sug-1',
    amountMinor: 45000,
    direction: 'debit',
    occurredAt: 1_700_000_000_000,
    account: 'Swiggy',
    normalizedKey: 'swiggy',
    paymentMethod: 'upi',
    smsSender: 'AD-HDFCBK-S',
    smsReceivedAt: 1_700_000_000_000,
    dedupeKey: 'dedupe-1',
    status: 'pending',
    confirmedTransactionId: null,
    createdAt: 1_700_000_000_000,
    ...overrides,
  };
}

function rule(overrides: Partial<AccountRule> = {}): AccountRule {
  return {
    normalizedKey: 'swiggy',
    displayAccount: 'Swiggy',
    lastNote: 'Lunch',
    categoryId: 'cat-food',
    lastPaymentMethod: 'upi',
    hitCount: 3,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockInsertedRows.length = 0;
  mockUpdates.length = 0;
});

describe('handleSave', () => {
  it('is a noop when the Suggestion is gone (dismissed/purged)', async () => {
    getSuggestionMock.mockReturnValue(null);
    const result = await handleSave('sug-1');
    expect(result).toEqual({ outcome: 'noop', reason: 'gone' });
    expect(mockInsertedRows).toHaveLength(0);
  });

  it('is a noop when already confirmed (stale/double tap)', async () => {
    getSuggestionMock.mockReturnValue(suggestion({ status: 'confirmed' }));
    const result = await handleSave('sug-1');
    expect(result).toEqual({ outcome: 'noop', reason: 'already-confirmed' });
    expect(mockInsertedRows).toHaveLength(0);
  });

  it('does not write blind when the rule is gone (race, §31.5)', async () => {
    getSuggestionMock.mockReturnValue(suggestion());
    getAccountRuleMock.mockReturnValue(null);
    const result = await handleSave('sug-1');
    expect(result).toEqual({ outcome: 'noop', reason: 'no-rule' });
    expect(mockInsertedRows).toHaveLength(0);
  });

  it('does not write blind when the rule has neither a category nor a note', async () => {
    getSuggestionMock.mockReturnValue(suggestion());
    getAccountRuleMock.mockReturnValue(rule({ categoryId: null, lastNote: null }));
    const result = await handleSave('sug-1');
    expect(result).toEqual({ outcome: 'noop', reason: 'no-rule' });
  });

  it('saves an Uncategorized transaction when the rule has a note but no category yet (§25.1)', async () => {
    getSuggestionMock.mockReturnValue(suggestion());
    getAccountRuleMock.mockReturnValue(rule({ categoryId: null, lastNote: 'Splitwise' }));
    const result = await handleSave('sug-1');
    expect(result.outcome).toBe('saved');
    expect(mockInsertedRows[0]).toEqual(expect.objectContaining({ categoryId: null, note: 'Splitwise' }));
  });

  it('does not write when the suggestion has no amount/direction/occurredAt', async () => {
    getSuggestionMock.mockReturnValue(suggestion({ amountMinor: null }));
    getAccountRuleMock.mockReturnValue(rule());
    const result = await handleSave('sug-1');
    expect(result).toEqual({ outcome: 'noop', reason: 'incomplete' });
  });

  it('writes the transaction, confirms the suggestion, bumps the rule, cancels the notification', async () => {
    getSuggestionMock.mockReturnValue(suggestion());
    getAccountRuleMock.mockReturnValue(rule());

    const result = await handleSave('sug-1');

    expect(result).toEqual({ outcome: 'saved', transactionId: 'new-txn-id' });
    expect(mockInsertedRows).toEqual([
      expect.objectContaining({
        id: 'new-txn-id',
        amountMinor: 45000,
        direction: 'debit',
        type: 'expense',
        categoryId: 'cat-food',
        paymentMethod: 'upi',
        note: 'Lunch',
        source: 'sms',
        dedupeKey: 'dedupe-1',
      }),
    ]);
    expect(mockUpdates).toEqual([
      expect.objectContaining({
        values: expect.objectContaining({ status: 'confirmed', confirmedTransactionId: 'new-txn-id' }),
      }),
      expect.objectContaining({ values: expect.objectContaining({ hitCount: 4 }) }),
    ]);
    expect(cancelForSuggestionMock).toHaveBeenCalledWith('sug-1');
  });

  it('forces categoryId null for a credit (IMP-011 — income has no category)', async () => {
    getSuggestionMock.mockReturnValue(suggestion({ direction: 'credit' }));
    getAccountRuleMock.mockReturnValue(rule());

    await handleSave('sug-1');

    expect(mockInsertedRows[0]).toEqual(expect.objectContaining({ type: 'income', categoryId: null }));
  });
});

describe('handleDiscard', () => {
  it('cancels the notification and no-ops when the Suggestion is gone', async () => {
    getSuggestionMock.mockReturnValue(null);
    const result = await handleDiscard('sug-1');
    expect(result).toEqual({ outcome: 'noop' });
    expect(dismissSuggestionMock).not.toHaveBeenCalled();
    expect(cancelForSuggestionMock).toHaveBeenCalledWith('sug-1');
  });

  it('cancels the notification and no-ops when already confirmed', async () => {
    getSuggestionMock.mockReturnValue(suggestion({ status: 'confirmed' }));
    const result = await handleDiscard('sug-1');
    expect(result).toEqual({ outcome: 'noop' });
    expect(dismissSuggestionMock).not.toHaveBeenCalled();
  });

  it('hard-deletes a pending Suggestion and writes nothing to the ledger (IMP-007)', async () => {
    getSuggestionMock.mockReturnValue(suggestion());
    const result = await handleDiscard('sug-1');
    expect(result).toEqual({ outcome: 'discarded' });
    expect(dismissSuggestionMock).toHaveBeenCalledWith('sug-1');
    expect(mockInsertedRows).toHaveLength(0);
    expect(cancelForSuggestionMock).toHaveBeenCalledWith('sug-1');
  });
});
