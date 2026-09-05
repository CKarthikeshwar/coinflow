/**
 * FILE PURPOSE
 * ------------
 * The fixed set of icons for the 9 built-in default categories plus the two system-only rows
 * (Uncategorized, income) — a deliberate design decision that a category's *icon* is its main
 * visual identity, not a color (there's no per-category color in the main UI; color is reserved
 * for the Analytics chart only — see `constants/theme.ts`'s `CategoryPalette` note).
 *
 * WHERE IT FITS
 * -------------
 * The only consumer is `src/features/categories/category-editor-sheet.tsx`, which uses these 9
 * default-category icons (excluding the two system-only ones) as the fixed icon-choice grid
 * when creating or editing ANY category — including a brand-new custom one. Icon reuse across
 * categories is allowed by design; there's no requirement that each category have a unique icon.
 *
 * Note this is a different thing from a category's stored `icon` column in the database
 * (`src/db/schema.ts`) — that's the actual current icon for one specific category row (which
 * could theoretically be any `IconName`, though in practice the editor only offers this fixed
 * set). `src/db/seed-data.ts` separately lists which of these icons each *default* category
 * starts out with when the app is first installed.
 */

import type { IconName } from '@/ui/icon';

export type CategoryKey =
  | 'bills'
  | 'food'
  | 'groceries'
  | 'transport'
  | 'shopping'
  | 'entertainment'
  | 'health'
  | 'education'
  | 'other'
  | 'uncategorized'
  | 'income';

export const CategoryIcons: Record<CategoryKey, IconName> = {
  food: 'utensils',
  transport: 'bus',
  groceries: 'shopping-basket',
  bills: 'receipt',
  shopping: 'shopping-bag',
  entertainment: 'clapperboard',
  health: 'heart-pulse',
  education: 'graduation-cap',
  other: 'shapes',
  uncategorized: 'help-circle',
  income: 'arrow-down-to-line',
};
