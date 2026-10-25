/**
 * FILE PURPOSE
 * ------------
 * Decides how a transaction should be auto-categorized based on which account/merchant it
 * came from. This app deliberately does NOT guess a category from keywords or machine
 * learning (see `idea.md` §7) — the only signal it trusts is "have I seen this exact account
 * before, and what did the user pick last time?" That memory is an `AccountRule` row.
 *
 * WHERE IT FITS
 * -------------
 * This sits between the account-rule "memory" (`src/db/repositories/account-rules.ts`, which
 * reads/writes the learned rule for an account) and anything that needs to turn that rule into
 * an actual decision: which category to pre-fill, and whether the account counts as "known"
 * (safe to one-tap-save) or "new" (needs the user to review it first).
 *
 * USED BY
 * -------
 * - `src/features/transactions/transaction-sheet.tsx` — pre-fills category/note/payment method
 *   when the Add/Confirm sheet opens for a recognized account (`resolveCategoryForAccount`).
 * - `src/app/review-queue.tsx`, `src/services/notifications/content.ts`,
 *   `src/services/notifications/respond.ts` — all use `isKnownAccountRule` to decide whether a
 *   detected transaction gets a one-tap "Save" action or has to be reviewed manually.
 *
 * DEPENDS ON
 * ----------
 * Only the `AccountRule`/`PaymentMethod` *types* from `src/db/schema.ts` — this file never
 * queries the database itself, it just interprets a rule row that's handed to it.
 *
 * IMPORTANT
 * ---------
 * `resolveCategoryForAccount` intentionally returns Uncategorized (`categoryId: null`) when
 * there's no rule at all — it never falls back to guessing. If you're tempted to add keyword
 * matching or a default category here, that would go against a deliberate product decision.
 */

import type { AccountRule, Category, CategoryAppliesTo, Direction, PaymentMethod } from '@/db/schema';

export type ResolvedCategory = {
  categoryId: string | null;
  note: string | null;
  paymentMethod: PaymentMethod | null;
};

/**
 * §25.1 — on detection / autocomplete pick. `null` key (no parsed/typed account) always
 * stays Uncategorized with a blank note — never guessed (`idea.md` §7).
 */
export function resolveCategoryForAccount(
  rule: AccountRule | null,
  direction: Direction = 'debit',
): ResolvedCategory {
  if (!rule) return { categoryId: null, note: null, paymentMethod: null };
  return { categoryId: ruleCategoryFor(rule, direction), note: rule.lastNote, paymentMethod: rule.lastPaymentMethod };
}

/**
 * CR-28 — an account remembers one *expense* category (`categoryId`) and one *income* category
 * (`incomeCategoryId`), because the same person can both be paid by you and pay you back.
 */
export function ruleCategoryFor(rule: AccountRule, direction: Direction): string | null {
  return direction === 'credit' ? rule.incomeCategoryId : rule.categoryId;
}

/**
 * §25.1 notification/queue action-set rule: a rule with a remembered category for this direction
 * (CR-28: expense category for a debit, income category for a credit) **or** a non-null `lastNote`
 * counts as "known" (gets one-tap `Save`); otherwise "new".
 */
export function isKnownAccountRule(rule: AccountRule | null, direction: Direction = 'debit'): boolean {
  if (!rule) return false;
  return ruleCategoryFor(rule, direction) !== null || rule.lastNote !== null;
}

/** CR-28 — the categories the Add / Confirm picker offers for a transaction of this kind (order preserved). */
export function categoriesFor(list: Category[], appliesTo: CategoryAppliesTo): Category[] {
  return list.filter((c) => c.appliesTo === appliesTo);
}
