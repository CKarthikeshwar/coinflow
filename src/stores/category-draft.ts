/**
 * FILE PURPOSE
 * ------------
 * Working copy for the Create/Edit Category sheet
 * (`src/features/categories/category-editor-sheet.tsx`, reached from Settings › Categories).
 * `categoryId: null` means the sheet is creating a brand-new category; a non-null id means it's
 * editing an existing one. Same ephemeral-draft-with-dirty-tracking pattern as
 * `add-sheet-draft.ts` — see that file's header for why `dirty` is computed as a real diff
 * against the seeded values rather than a one-way flag.
 */

import { create } from 'zustand';

import type { CategoryAppliesTo } from '@/db/schema';

export type CategoryDraft = {
  categoryId: string | null; // null = creating a new category
  name: string;
  icon: string;
  /** CR-28 — chosen when creating; fixed once the category exists. */
  appliesTo: CategoryAppliesTo;
  dirty: boolean;
  submitting: boolean;
  error: string | null;
};

export type CategoryDraftSeed = Pick<CategoryDraft, 'categoryId' | 'name' | 'icon'> & Partial<Pick<CategoryDraft, 'appliesTo'>>;

const BLANK: CategoryDraft = {
  categoryId: null,
  name: '',
  icon: 'shapes',
  appliesTo: 'expense',
  dirty: false,
  submitting: false,
  error: null,
};

const DIRTY_KEYS = ['name', 'icon', 'appliesTo'] as const satisfies readonly (keyof CategoryDraft)[];

function computeDirty(current: CategoryDraft, initial: CategoryDraft): boolean {
  return DIRTY_KEYS.some((key) => current[key] !== initial[key]);
}

type CategoryDraftStore = CategoryDraft & {
  _initial: CategoryDraft;
  open: (seed: CategoryDraftSeed) => void;
  patch: (fields: Partial<Pick<CategoryDraft, 'name' | 'icon' | 'appliesTo'>>) => void;
  setSubmitting: (submitting: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
};

export const useCategoryDraft = create<CategoryDraftStore>((set) => ({
  ...BLANK,
  _initial: BLANK,
  open: (seed) => {
    const full: CategoryDraft = { ...BLANK, ...seed, dirty: false };
    set({ ...full, _initial: full });
  },
  patch: (fields) =>
    set((s) => {
      const next = { ...s, ...fields };
      return { ...next, dirty: computeDirty(next, s._initial) };
    }),
  setSubmitting: (submitting) => set({ submitting }),
  setError: (error) => set({ error }),
  reset: () => set({ ...BLANK, _initial: BLANK }),
}));
