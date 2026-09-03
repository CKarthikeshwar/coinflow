/**
 * The Account rules editor's working copy (SPEC-implementation.md §21.3/§30.16, D16). Mirrors
 * `category-draft.ts`'s shape — ephemeral, never persisted, `dirty` drives the discard-confirm
 * (V-6) via `SheetHost`. There's no "create" mode: rules are only ever seeded by
 * `upsertFromTransaction` (F8) the first time an account is saved on a transaction; this store
 * only ever edits an existing row.
 */

import { create } from 'zustand';

export type AccountRuleDraft = {
  normalizedKey: string;
  lastNote: string;
  categoryId: string | null;
  dirty: boolean;
  submitting: boolean;
};

export type AccountRuleDraftSeed = Pick<AccountRuleDraft, 'normalizedKey' | 'lastNote' | 'categoryId'>;

const BLANK: AccountRuleDraft = {
  normalizedKey: '',
  lastNote: '',
  categoryId: null,
  dirty: false,
  submitting: false,
};

const DIRTY_KEYS = ['lastNote', 'categoryId'] as const satisfies readonly (keyof AccountRuleDraft)[];

function computeDirty(current: AccountRuleDraft, initial: AccountRuleDraft): boolean {
  return DIRTY_KEYS.some((key) => current[key] !== initial[key]);
}

type AccountRuleDraftStore = AccountRuleDraft & {
  _initial: AccountRuleDraft;
  open: (seed: AccountRuleDraftSeed) => void;
  patch: (fields: Partial<Pick<AccountRuleDraft, 'lastNote' | 'categoryId'>>) => void;
  setSubmitting: (submitting: boolean) => void;
  reset: () => void;
};

export const useAccountRuleDraft = create<AccountRuleDraftStore>((set) => ({
  ...BLANK,
  _initial: BLANK,
  open: (seed) => {
    const full: AccountRuleDraft = { ...BLANK, ...seed, dirty: false };
    set({ ...full, _initial: full });
  },
  patch: (fields) =>
    set((s) => {
      const next = { ...s, ...fields };
      return { ...next, dirty: computeDirty(next, s._initial) };
    }),
  setSubmitting: (submitting) => set({ submitting }),
  reset: () => set({ ...BLANK, _initial: BLANK }),
}));
