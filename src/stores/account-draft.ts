/**
 * The in-progress values of the Add / Edit account sheet (UI-103a, `features/accounts/account-sheet.tsx`). Same shape
 * and `dirty` rule as `category-draft.ts`: a real diff against the seeded values, so `SheetHost` can block
 * swipe-to-close only while something was actually changed.
 */

import { create } from 'zustand';

import type { AccountKind } from '@/db/schema';

export type AccountDraft = {
  accountId: string | null; // null = adding a new account
  kind: AccountKind;
  nickname: string;
  bankName: string;
  last4: string;
  dirty: boolean;
  submitting: boolean;
  error: string | null;
};

export type AccountDraftSeed = Partial<
  Pick<AccountDraft, 'accountId' | 'kind' | 'nickname' | 'bankName' | 'last4'>
>;

const BLANK: AccountDraft = {
  accountId: null,
  kind: 'bank',
  nickname: '',
  bankName: '',
  last4: '',
  dirty: false,
  submitting: false,
  error: null,
};

const DIRTY_KEYS = ['kind', 'nickname', 'bankName', 'last4'] as const satisfies readonly (keyof AccountDraft)[];

type AccountDraftStore = AccountDraft & {
  _initial: AccountDraft;
  open: (seed: AccountDraftSeed) => void;
  patch: (fields: Partial<Pick<AccountDraft, 'kind' | 'nickname' | 'bankName' | 'last4'>>) => void;
  setSubmitting: (submitting: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
};

export const useAccountDraft = create<AccountDraftStore>((set) => ({
  ...BLANK,
  _initial: BLANK,
  open: (seed) => {
    const full: AccountDraft = { ...BLANK, ...seed, dirty: false };
    set({ ...full, _initial: full });
  },
  patch: (fields) =>
    set((s) => {
      const next = { ...s, ...fields, error: null };
      return { ...next, dirty: DIRTY_KEYS.some((key) => next[key] !== s._initial[key]) };
    }),
  setSubmitting: (submitting) => set({ submitting }),
  setError: (error) => set({ error, submitting: false }),
  reset: () => set({ ...BLANK, _initial: BLANK }),
}));
