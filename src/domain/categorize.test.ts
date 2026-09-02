import type { AccountRule } from '@/db/schema';

import { isKnownAccountRule, resolveCategoryForAccount } from './categorize';

function rule(overrides: Partial<AccountRule> = {}): AccountRule {
  return {
    normalizedKey: 'swiggy',
    displayAccount: 'Swiggy',
    lastNote: null,
    categoryId: null,
    lastPaymentMethod: null,
    hitCount: 1,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe('resolveCategoryForAccount', () => {
  it('stays Uncategorized with a blank note when there is no rule', () => {
    expect(resolveCategoryForAccount(null)).toEqual({ categoryId: null, note: null, paymentMethod: null });
  });

  it('carries the rule\'s category, note, and payment method — never guesses beyond it', () => {
    const r = rule({ categoryId: 'cat-food', lastNote: 'Lunch', lastPaymentMethod: 'upi' });
    expect(resolveCategoryForAccount(r)).toEqual({ categoryId: 'cat-food', note: 'Lunch', paymentMethod: 'upi' });
  });

  it('a rule with no category yet still resolves to Uncategorized, not a guess', () => {
    const r = rule({ categoryId: null, lastNote: 'Splitwise' });
    expect(resolveCategoryForAccount(r)).toEqual({ categoryId: null, note: 'Splitwise', paymentMethod: null });
  });
});

describe('isKnownAccountRule (§25.1 notification/queue action-set rule)', () => {
  it('is false with no rule', () => {
    expect(isKnownAccountRule(null)).toBe(false);
  });

  it('is true when the rule has a category, even with no note', () => {
    expect(isKnownAccountRule(rule({ categoryId: 'cat-food', lastNote: null }))).toBe(true);
  });

  it('is true when the rule has a note, even with no category', () => {
    expect(isKnownAccountRule(rule({ categoryId: null, lastNote: 'Splitwise' }))).toBe(true);
  });

  it('is false when the rule has neither a category nor a note', () => {
    expect(isKnownAccountRule(rule({ categoryId: null, lastNote: null }))).toBe(false);
  });
});
