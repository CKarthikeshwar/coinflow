/**
 * FILE PURPOSE
 * ------------
 * Holds what the user is currently selecting inside the Transactions list's Filter sheet
 * (`src/features/transactions/filter-sheet.tsx`) — category checkboxes, payment method chips,
 * date range — while they're still tapping around, before they hit "Apply."
 *
 * WHERE IT FITS
 * -------------
 * IMPORTANT: this store is NOT where the *active* filter (the one actually narrowing the
 * transaction list right now) lives — that lives in the Transactions screen's own route/URL
 * params instead (see `src/features/transactions/filter-params.ts` and
 * `src/app/(tabs)/transactions.tsx`), which is what lets a filtered view be part of navigation
 * history/deep-linking. This store is purely the sheet's in-progress, not-yet-applied draft:
 * `seed()` copies the currently-applied filter in when the sheet opens, `set()` tracks taps
 * while it's open, and only when the user taps "Apply" does the screen read this draft's
 * current value and push it into the route params — that's the actual "apply" step, and it
 * happens outside this file.
 */

import { create } from 'zustand';

import type { PaymentMethod, TransactionType } from '@/db/schema';

export type FilterDraft = {
  categoryIds: string[];
  /** Uncategorized isn't a real `category.id` (§25.3 — `categoryId IS NULL`), so it's its own
   * flag, not an entry in `categoryIds` (F7). */
  uncategorized: boolean;
  type: TransactionType | null;
  methods: PaymentMethod[];
  from: number | null;
  to: number | null;
};

const EMPTY: FilterDraft = {
  categoryIds: [],
  uncategorized: false,
  type: null,
  methods: [],
  from: null,
  to: null,
};

type FilterDraftStore = FilterDraft & {
  set: (patch: Partial<FilterDraft>) => void;
  seed: (applied: Partial<FilterDraft>) => void;
  reset: () => void;
};

export const useFilterDraft = create<FilterDraftStore>((set) => ({
  ...EMPTY,
  set: (patch) => set((s) => ({ ...s, ...patch })),
  seed: (applied) => set({ ...EMPTY, ...applied }),
  reset: () => set({ ...EMPTY }),
}));
