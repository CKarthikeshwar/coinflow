/**
 * The Create/Edit Category working copy (SPEC-implementation.md §22.2, mirrors
 * `add-sheet-draft.ts`'s shape). Ephemeral — never persisted, cleared on sheet close.
 * `dirty` drives the discard-confirm (V-6) via `SheetHost`.
 *
 * `dirty` is a real diff against the seeded values (`_initial`), not a latch — see
 * `add-sheet-draft.ts`'s header for why.
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
