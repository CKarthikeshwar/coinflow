/**
 * Category identity rests on the icon, not colour (SPEC-UI-UX.md §3.4 / §29.2).
 * Each of the 9 default categories + the two system rows (Uncategorized, income) maps
 * to a fixed glyph. Values are `IconName`s resolved by `src/ui/icon.tsx`.
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
