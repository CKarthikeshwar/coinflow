import type { Suggestion, Transaction } from '@/db/schema';
import { getSuggestion } from '@/db/repositories/suggestions';
import { getTransaction } from '@/db/repositories/transactions';

import { resolveNotificationTarget } from './deep-link';

jest.mock('@/db/repositories/suggestions', () => ({ getSuggestion: jest.fn() }));
jest.mock('@/db/repositories/transactions', () => ({ getTransaction: jest.fn() }));

const mockGetSuggestion = getSuggestion as jest.Mock;
const mockGetTransaction = getTransaction as jest.Mock;

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

function transaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'txn-1',
    amountMinor: 45000,
    direction: 'debit',
    type: 'expense',
    categoryId: null,
    paymentMethod: 'upi',
    account: 'Swiggy',
    normalizedAccountKey: 'swiggy',
    note: null,
    description: null,
    searchText: '',
    occurredAt: 1_700_000_000_000,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    deletedAt: null,
    source: 'sms',
    smsSender: null,
    smsReceivedAt: null,
    dedupeKey: null,
    editedByUser: false,
    ...overrides,
  };
}

beforeEach(() => {
  mockGetSuggestion.mockReset();
  mockGetTransaction.mockReset();
});

describe('resolveNotificationTarget', () => {
  it('routes a group notification to Review Queue without touching the DB', () => {
    expect(resolveNotificationTarget({ kind: 'group' })).toEqual({ kind: 'review' });
    expect(mockGetSuggestion).not.toHaveBeenCalled();
  });

  it('routes a pending suggestion to Confirm', () => {
    mockGetSuggestion.mockReturnValue(suggestion({ status: 'pending' }));
    expect(resolveNotificationTarget({ kind: 'suggestion', suggestionId: 'sug-1' })).toEqual({
      kind: 'confirm',
      suggestionId: 'sug-1',
    });
  });

  it('routes an already-confirmed suggestion to its Transaction', () => {
    mockGetSuggestion.mockReturnValue(
      suggestion({ status: 'confirmed', confirmedTransactionId: 'txn-1' }),
    );
    mockGetTransaction.mockReturnValue(transaction());
    expect(resolveNotificationTarget({ kind: 'suggestion', suggestionId: 'sug-1' })).toEqual({
      kind: 'transaction',
      transactionId: 'txn-1',
    });
  });

  it('routes to Home when the underlying transaction was soft-deleted', () => {
    mockGetSuggestion.mockReturnValue(
      suggestion({ status: 'confirmed', confirmedTransactionId: 'txn-1' }),
    );
    mockGetTransaction.mockReturnValue(transaction({ deletedAt: 1_700_000_100_000 }));
    expect(resolveNotificationTarget({ kind: 'suggestion', suggestionId: 'sug-1' })).toEqual({
      kind: 'home',
    });
  });

  it('routes to Home when the suggestion row is gone (dismissed)', () => {
    mockGetSuggestion.mockReturnValue(null);
    expect(resolveNotificationTarget({ kind: 'suggestion', suggestionId: 'sug-1' })).toEqual({
      kind: 'home',
    });
  });

  it('routes to Home for missing/malformed data', () => {
    expect(resolveNotificationTarget(undefined)).toEqual({ kind: 'home' });
    expect(resolveNotificationTarget(null)).toEqual({ kind: 'home' });
    expect(resolveNotificationTarget({ kind: 'suggestion' })).toEqual({ kind: 'home' });
  });
});
