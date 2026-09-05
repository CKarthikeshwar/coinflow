/**
 * FILE PURPOSE
 * ------------
 * Working copy for the "edit an account rule" sheet (`src/features/settings/account-rule-editor-sheet.tsx`,
 * reached from Settings › Account rules) — lets the user tweak the note/category that gets
 * auto-filled for a given bank account. Same ephemeral-draft-with-dirty-tracking shape as
 * `add-sheet-draft.ts` and `category-draft.ts`, just for this smaller form.
 *
 * IMPORTANT
 * ---------
 * There is no "create" mode here — an account rule is never created directly by the user. It's
 * only ever first created automatically by `upsertFromTransaction`
 * (`src/db/repositories/account-rules.ts`) the first time a transaction is saved with that
 * account. This store only ever edits a rule that already exists.
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
