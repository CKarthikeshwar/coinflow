/**
 * Categorization — SPEC-implementation.md §25. No colour, no keyword map, no ML in V1.
 * Pure TS, no react-native / expo imports — `db/repositories/account-rules.ts` supplies the
 * `AccountRule` row this reads.
 */

import type { AccountRule, PaymentMethod } from '@/db/schema';

export type ResolvedCategory = {
  categoryId: string | null;
  note: string | null;
  paymentMethod: PaymentMethod | null;
};

/**
 * §25.1 — on detection / autocomplete pick. `null` key (no parsed/typed account) always
 * stays Uncategorized with a blank note — never guessed (`idea.md` §7).
 */
export function resolveCategoryForAccount(rule: AccountRule | null): ResolvedCategory {
  if (!rule) return { categoryId: null, note: null, paymentMethod: null };
  return { categoryId: rule.categoryId, note: rule.lastNote, paymentMethod: rule.lastPaymentMethod };
}

/**
 * §25.1 notification/queue action-set rule: a rule with a non-null `categoryId` **or** a
 * non-null `lastNote` counts as "known" (gets one-tap `Save`); otherwise "new".
 */
export function isKnownAccountRule(rule: AccountRule | null): boolean {
  if (!rule) return false;
  return rule.categoryId !== null || rule.lastNote !== null;
}
