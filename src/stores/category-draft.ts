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

export type CategoryDraft = {
  categoryId: string | null; // null = creating a new category
  name: string;
  icon: string;
  dirty: boolean;
  submitting: boolean;
  error: string | null;
};

export type CategoryDraftSeed = Pick<CategoryDraft, 'categoryId' | 'name' | 'icon'>;

const BLANK: CategoryDraft = {
  categoryId: null,
  name: '',
  icon: 'shapes',
  dirty: false,
  submitting: false,
  error: null,
};

const DIRTY_KEYS = ['name', 'icon'] as const satisfies readonly (keyof CategoryDraft)[];

function computeDirty(current: CategoryDraft, initial: CategoryDraft): boolean {
  return DIRTY_KEYS.some((key) => current[key] !== initial[key]);
}

type CategoryDraftStore = CategoryDraft & {
  _initial: CategoryDraft;
  open: (seed: CategoryDraftSeed) => void;
  patch: (fields: Partial<Pick<CategoryDraft, 'name' | 'icon'>>) => void;
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
