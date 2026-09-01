/**
 * Seed data (SPEC-implementation.md §20.5) — pure constants, no database import, so it's
 * unit-testable without a native SQLite. `seed.ts` holds the functions that apply it.
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
