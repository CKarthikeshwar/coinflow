/**
 * The actual list of default categories every install starts with — plain data only, no
 * database import, kept separate from `seed.ts` (which has the functions that write these rows
 * into the database) so the data itself is trivial to unit-test and to read/update on its own.
 * `isProtected: true` only on "Uncategorized" and "Other" — those two can never be deleted or
 * renamed by the user, since the app relies on both always existing.
 */

export const SEED_VERSION = 1;
export const SEEDED_VERSION_KEY = 'schemaSeededVersion';

export type SeededCategory = {
  key: string;
  name: string;
  icon: string;
  kind: 'system' | 'default';
  isProtected: boolean;
  order: number;
};

/** The system row + the 9 defaults. `isProtected` only on `uncategorized` and `other`. */
export const SEED_CATEGORIES: SeededCategory[] = [
  { key: 'uncategorized', name: 'Uncategorized', icon: 'help-circle', kind: 'system', isProtected: true, order: 0 },
  { key: 'food', name: 'Food', icon: 'utensils', kind: 'default', isProtected: false, order: 1 },
  { key: 'transport', name: 'Transport', icon: 'bus', kind: 'default', isProtected: false, order: 2 },
  { key: 'groceries', name: 'Groceries', icon: 'shopping-basket', kind: 'default', isProtected: false, order: 3 },
  { key: 'bills', name: 'Bills', icon: 'receipt', kind: 'default', isProtected: false, order: 4 },
  { key: 'shopping', name: 'Shopping', icon: 'shopping-bag', kind: 'default', isProtected: false, order: 5 },
  { key: 'entertainment', name: 'Entertainment', icon: 'clapperboard', kind: 'default', isProtected: false, order: 6 },
  { key: 'health', name: 'Health', icon: 'heart-pulse', kind: 'default', isProtected: false, order: 7 },
  { key: 'education', name: 'Education', icon: 'graduation-cap', kind: 'default', isProtected: false, order: 8 },
  { key: 'other', name: 'Other', icon: 'shapes', kind: 'default', isProtected: true, order: 9 },
];
