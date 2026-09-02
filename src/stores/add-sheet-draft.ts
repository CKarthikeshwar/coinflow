/**
 * The Add / Edit / Confirmation working copy (SPEC-implementation.md §22.2). Ephemeral —
 * never persisted, cleared on sheet close. `dirty` drives the discard-confirm (V-6).
 * The exact field set firms up with the sheets in step 5 (§22.6).
 *
 * `dirty` is a real diff against the seeded values (`_initial`), not a latch that stays true
 * after the first `patch()` call — toggling a field back to what it was seeded with correctly
 * clears it, rather than permanently flagging the draft as changed for a net-no-op edit.
 *
 * `direction`/`type` and `paymentMethod` are deliberately excluded from `DIRTY_KEYS`: they're
 * `SegmentedControl` "tab switches", not data entry — flipping Expense/Income or UPI/Cash while
 * exploring the sheet isn't something a user would want a "discard changes?" prompt over, even
 * on a forward (non-reverted) toggle. Only fields that represent actually-typed-or-chosen data
 * (amount, category, account, note, description) count toward dirty.
 */

import { create } from 'zustand';

import type { Direction, PaymentMethod, TransactionType } from '@/db/schema';

export type DraftMode = 'add' | 'edit' | 'confirm';

export type AddSheetDraft = {
  mode: DraftMode;
  sourceId?: string; // suggestion id (confirm) or transaction id (edit)
  amountMinor: number;
  direction: Direction;
  type: TransactionType;
  categoryId: string | null;
  paymentMethod: PaymentMethod | null;
  account: string;
  note: string;
  description: string;
  occurredAt: number;
  dirty: boolean;
  submitting: boolean;
  error: string | null;
};

export type AddSheetDraftSeed = Partial<Omit<AddSheetDraft, 'dirty' | 'submitting' | 'error'>>;

const BLANK: AddSheetDraft = {
  mode: 'add',
  amountMinor: 0,
  direction: 'debit',
  type: 'expense',
  categoryId: null,
  paymentMethod: null,
  account: '',
  note: '',
  description: '',
  occurredAt: 0,
  dirty: false,
  submitting: false,
  error: null,
};

const DIRTY_KEYS = [
  'amountMinor',
  'categoryId',
  'account',
  'note',
  'description',
] as const satisfies readonly (keyof AddSheetDraft)[];

function computeDirty(current: AddSheetDraft, initial: AddSheetDraft): boolean {
  return DIRTY_KEYS.some((key) => current[key] !== initial[key]);
}

type AddSheetDraftStore = AddSheetDraft & {
  _initial: AddSheetDraft;
  open: (seed?: AddSheetDraftSeed) => void;
  patch: (fields: Partial<AddSheetDraft>) => void;
  setSubmitting: (submitting: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
};

export const useAddSheetDraft = create<AddSheetDraftStore>((set) => ({
  ...BLANK,
  _initial: BLANK,
  open: (seed) => {
    const full: AddSheetDraft = { ...BLANK, occurredAt: Date.now(), ...seed, dirty: false };
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
