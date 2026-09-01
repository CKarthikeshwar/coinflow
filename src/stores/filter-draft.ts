/**
 * The Filter sheet's working selection before Apply (SPEC-implementation.md §22.2 / §6.9).
 * The *applied* filter lives in Transactions route params, not here.
 */

import { create } from 'zustand';

import type { PaymentMethod, TransactionType } from '@/db/schema';

export type FilterDraft = {
  categoryIds: string[];
  type: TransactionType | null;
  methods: PaymentMethod[];
  from: number | null;
  to: number | null;
};

const EMPTY: FilterDraft = { categoryIds: [], type: null, methods: [], from: null, to: null };

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
