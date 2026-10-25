/**
 * The actual list of default categories every install starts with — plain data only, no
 * database import, kept separate from `seed.ts` (which has the functions that write these rows
 * into the database) so the data itself is trivial to unit-test and to read/update on its own.
 * `isProtected: true` only on "Uncategorized" and "Other" — those two can never be deleted or
 * renamed by the user, since the app relies on both always existing.
 */

export const SEED_VERSION = 3; // 2 = CR-28: income categories · 3 = CR-31: clearer income-category icons
export const SEEDED_VERSION_KEY = 'schemaSeededVersion';

export type SeededCategory = {
  key: string;
  name: string;
  icon: string;
  kind: 'system' | 'default';
  /** CR-28 — offered for expenses or for income. */
  appliesTo: 'expense' | 'income';
  /**
   * CR-29 — the `SEED_VERSION` that introduced this row. An upgrade only inserts rows newer than the version the
   * install was last seeded with, so a default the user deleted (onboarding's "Pick your categories", or Settings)
   * is never brought back.
   */
  since: number;
  isProtected: boolean;
  order: number;
};

/** The system row + the 9 expense defaults + the 7 income defaults (CR-28). `isProtected` only on `uncategorized`, `other` and `other_income`. */
export const SEED_CATEGORIES: SeededCategory[] = [
  { key: 'uncategorized', name: 'Uncategorized', icon: 'help-circle', kind: 'system', appliesTo: 'expense', isProtected: true, order: 0, since: 1 },
  { key: 'food', name: 'Food', icon: 'utensils', kind: 'default', appliesTo: 'expense', isProtected: false, order: 1, since: 1 },
  { key: 'transport', name: 'Transport', icon: 'bus', kind: 'default', appliesTo: 'expense', isProtected: false, order: 2, since: 1 },
  { key: 'groceries', name: 'Groceries', icon: 'shopping-basket', kind: 'default', appliesTo: 'expense', isProtected: false, order: 3, since: 1 },
  { key: 'bills', name: 'Bills', icon: 'receipt', kind: 'default', appliesTo: 'expense', isProtected: false, order: 4, since: 1 },
  { key: 'shopping', name: 'Shopping', icon: 'shopping-bag', kind: 'default', appliesTo: 'expense', isProtected: false, order: 5, since: 1 },
  { key: 'entertainment', name: 'Entertainment', icon: 'clapperboard', kind: 'default', appliesTo: 'expense', isProtected: false, order: 6, since: 1 },
  { key: 'health', name: 'Health', icon: 'heart-pulse', kind: 'default', appliesTo: 'expense', isProtected: false, order: 7, since: 1 },
  { key: 'education', name: 'Education', icon: 'graduation-cap', kind: 'default', appliesTo: 'expense', isProtected: false, order: 8, since: 1 },
  { key: 'other', name: 'Other', icon: 'shapes', kind: 'default', appliesTo: 'expense', isProtected: true, order: 9, since: 1 },
  // CR-28 — income categories. Existing installs get these from the SEED_VERSION 2 pass in `seed.ts`.
  { key: 'salary', name: 'Salary', icon: 'badge-indian-rupee', kind: 'default', appliesTo: 'income', isProtected: false, order: 10, since: 2 },
  { key: 'freelance', name: 'Freelance', icon: 'briefcase-business', kind: 'default', appliesTo: 'income', isProtected: false, order: 11, since: 2 },
  { key: 'interest', name: 'Interest', icon: 'chart-line', kind: 'default', appliesTo: 'income', isProtected: false, order: 12, since: 2 },
  { key: 'refund', name: 'Refund', icon: 'receipt-indian-rupee', kind: 'default', appliesTo: 'income', isProtected: false, order: 13, since: 2 },
  { key: 'gift', name: 'Gift', icon: 'gift', kind: 'default', appliesTo: 'income', isProtected: false, order: 14, since: 2 },
  { key: 'pocket_money', name: 'Pocket money', icon: 'hand-coins', kind: 'default', appliesTo: 'income', isProtected: false, order: 15, since: 2 },
  { key: 'other_income', name: 'Other income', icon: 'banknote-arrow-down', kind: 'default', appliesTo: 'income', isProtected: true, order: 16, since: 2 },
];

/**
 * CR-31 — seed v3 swapped the income categories' generic icons for clearer, rupee-flavoured ones. An install seeded
 * earlier is updated only where the row still has the *old* default icon, so an icon the user picked is kept.
 */
export const ICON_REFRESH_V3: { key: string; from: string; to: string }[] = [
  { key: 'salary', from: 'briefcase', to: 'badge-indian-rupee' },
  { key: 'freelance', from: 'laptop', to: 'briefcase-business' },
  { key: 'interest', from: 'percent', to: 'chart-line' },
  { key: 'refund', from: 'undo-2', to: 'receipt-indian-rupee' },
  { key: 'pocket_money', from: 'piggy-bank', to: 'hand-coins' },
  { key: 'other_income', from: 'circle-plus', to: 'banknote-arrow-down' },
];
