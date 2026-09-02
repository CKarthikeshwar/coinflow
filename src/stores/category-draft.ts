/**
 * The Create/Edit Category working copy (SPEC-implementation.md §22.2, mirrors
 * `add-sheet-draft.ts`'s shape). Ephemeral — never persisted, cleared on sheet close.
 * `dirty` drives the discard-confirm (V-6) via `SheetHost`.
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

type CategoryDraftStore = CategoryDraft & {
  open: (seed: CategoryDraftSeed) => void;
  patch: (fields: Partial<Pick<CategoryDraft, 'name' | 'icon'>>) => void;
  setSubmitting: (submitting: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
};

export const useCategoryDraft = create<CategoryDraftStore>((set) => ({
  ...BLANK,
  open: (seed) => set({ ...BLANK, ...seed, dirty: false }),
  patch: (fields) => set((s) => ({ ...s, ...fields, dirty: true })),
  setSubmitting: (submitting) => set({ submitting }),
  setError: (error) => set({ error }),
  reset: () => set({ ...BLANK }),
}));
