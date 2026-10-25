import type { AccountRule, Category } from '@/db/schema';

import { categoriesFor, isKnownAccountRule, resolveCategoryForAccount, ruleCategoryFor } from './categorize';

function rule(overrides: Partial<AccountRule> = {}): AccountRule {
  return {
    normalizedKey: 'swiggy',
    displayAccount: 'Swiggy',
    lastNote: null,
    categoryId: null,
    incomeCategoryId: null,
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

describe('CR-28 — income categories', () => {
  const swiggy = rule({ categoryId: 'cat-food', incomeCategoryId: 'cat-refund' });

  it('ruleCategoryFor picks the expense category for a debit and the income category for a credit', () => {
    expect(ruleCategoryFor(swiggy, 'debit')).toBe('cat-food');
    expect(ruleCategoryFor(swiggy, 'credit')).toBe('cat-refund');
  });

  it('resolveCategoryForAccount follows the direction (default: debit)', () => {
    expect(resolveCategoryForAccount(swiggy).categoryId).toBe('cat-food');
    expect(resolveCategoryForAccount(swiggy, 'credit').categoryId).toBe('cat-refund');
  });

  it('a rule is "known" for a credit only if it has an income category or a note', () => {
    expect(isKnownAccountRule(rule({ categoryId: 'cat-food', lastNote: null }), 'credit')).toBe(false);
    expect(isKnownAccountRule(rule({ incomeCategoryId: 'cat-salary', lastNote: null }), 'credit')).toBe(true);
    expect(isKnownAccountRule(rule({ categoryId: 'cat-food', lastNote: null }), 'debit')).toBe(true);
    expect(isKnownAccountRule(rule({ incomeCategoryId: 'cat-salary', lastNote: null }), 'debit')).toBe(false);
  });

  it('categoriesFor keeps only the categories of that kind, in order', () => {
    const mk = (id: string, appliesTo: 'expense' | 'income'): Category => ({
      id, key: null, name: id, icon: 'shapes', kind: 'default', appliesTo, isProtected: false, order: 0, createdAt: 0, updatedAt: 0,
    });
    const list = [mk('food', 'expense'), mk('salary', 'income'), mk('bills', 'expense')];
    expect(categoriesFor(list, 'income').map((c) => c.id)).toEqual(['salary']);
    expect(categoriesFor(list, 'expense').map((c) => c.id)).toEqual(['food', 'bills']);
  });
});
