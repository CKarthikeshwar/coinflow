import type { AccountRule, Suggestion } from '@/db/schema';

import { buildTxnNotification, isKnownAccount } from './content';

function suggestion(overrides: Partial<Suggestion> = {}): Suggestion {
  return {
    id: 'sug-1',
    amountMinor: 45000,
    direction: 'debit',
    occurredAt: 1_700_000_000_000,
    account: 'merchant@okhdfcbank',
    normalizedKey: 'merchant@okhdfcbank',
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
    normalizedKey: 'merchant@okhdfcbank',
    displayAccount: 'merchant@okhdfcbank',
    lastNote: null,
    categoryId: 'cat-food',
    lastPaymentMethod: 'upi',
    hitCount: 3,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...overrides,
  };
}

describe('isKnownAccount', () => {
  it('is false with no rule', () => {
    expect(isKnownAccount(null)).toBe(false);
  });

  it('is false for a rule with no category yet', () => {
    expect(isKnownAccount(rule({ categoryId: null }))).toBe(false);
  });

  it('is true for a rule with a category', () => {
    expect(isKnownAccount(rule())).toBe(true);
  });
});

describe('buildTxnNotification', () => {
  it('uses the known-account category when the rule has a category', () => {
    const content = buildTxnNotification(suggestion(), rule());
    expect(content.categoryIdentifier).toBe('txnKnown');
  });

  it('uses the new-account category with no rule', () => {
    const content = buildTxnNotification(suggestion(), null);
    expect(content.categoryIdentifier).toBe('txnNew');
  });

  it('uses the new-account category when the rule has no category', () => {
    const content = buildTxnNotification(suggestion(), rule({ categoryId: null }));
    expect(content.categoryIdentifier).toBe('txnNew');
  });

  it('titles a debit as "<amount> debited"', () => {
    const content = buildTxnNotification(suggestion({ direction: 'debit', amountMinor: 45000 }), null);
    expect(content.title).toBe('₹450 debited');
  });

  it('titles a credit as "<amount> credited"', () => {
    const content = buildTxnNotification(suggestion({ direction: 'credit', amountMinor: 120000 }), null);
    expect(content.title).toBe('₹1,200 credited');
  });

  it('bodies as "<account> · <method>"', () => {
    const content = buildTxnNotification(suggestion({ account: 'Swiggy', paymentMethod: 'upi' }), null);
    expect(content.body).toBe('Swiggy · UPI');
  });

  it('bodies as "Unknown account" when account is null', () => {
    const content = buildTxnNotification(suggestion({ account: null }), null);
    expect(content.body).toBe('Unknown account');
  });

  it('bodies as just the account when payment method is null', () => {
    const content = buildTxnNotification(suggestion({ account: 'Swiggy', paymentMethod: null }), null);
    expect(content.body).toBe('Swiggy');
  });

  it('carries only ids in data — no amount, account, or note', () => {
    const content = buildTxnNotification(suggestion(), rule());
    expect(content.data).toEqual({
      kind: 'suggestion',
      suggestionId: 'sug-1',
      dedupeKey: 'dedupe-1',
      ruleKey: 'merchant@okhdfcbank',
      postedAt: expect.any(Number),
    });
  });

  it("uses identifier 'sug:<id>' so a later run can find it deterministically", () => {
    const content = buildTxnNotification(suggestion({ id: 'abc-123' }), null);
    expect(content.identifier).toBe('sug:abc-123');
  });
});
