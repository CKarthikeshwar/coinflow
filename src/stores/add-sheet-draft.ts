/**
 * FILE PURPOSE
 * ------------
 * Holds the "working copy" of whatever transaction is currently being typed/edited in the
 * Add/Edit/Confirm sheet (`src/features/transactions/transaction-sheet.tsx`) — the amount,
 * category, note, etc. the user has entered so far, before it's actually saved to the database.
 * Ephemeral only: never persisted to disk, wiped clean on sheet close.
 *
 * WHERE IT FITS
 * -------------
 * `transaction-sheet.tsx` is effectively the only real consumer — it reads this store to render
 * the form and calls `patch()` on every field change, `open()` when the sheet is opened (for
 * Add, Edit, or Confirm), and `reset()` when the sheet closes for good (submitted or discarded).
 * `dirty` is what powers the "discard changes?" confirmation if the user tries to close a sheet
 * with unsaved edits.
 *
 * IMPORTANT
 * ---------
 * `dirty` is a genuine diff against the values the draft was *seeded* with (`_initial`), not a
 * one-way flag that latches "true" forever after the first edit — so typing something and then
 * typing it back to its original value correctly un-dirties the draft, instead of permanently
 * (and wrongly) prompting "discard changes?" for a net-zero edit.
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
 *
 * `active` (2026-09-04 fix) exists so `transaction-sheet.tsx`'s own mount effect can tell "a
 * genuinely new Add session is starting" apart from "the Add sheet just remounted because a
 * sub-picker (Category, at minimum) returned control to it." `SheetHost` conditionally renders
 * `<TransactionSheetBody mode="add"/>` only while `current === 'add'` — switching to
 * `categoryPicker` and back is a real unmount/remount, not a re-render, so the mount effect has
 * no component-local memory of "I already seeded this session." This store, being a persistent
 * Zustand singleton, is the one thing that survives that remount. `open()` sets `active` true;
 * `reset()` (called only on genuine session-end — discard or successful submit, never on a
 * sub-picker round trip) sets it back false. The mount effect only re-seeds a blank draft when
 * `!active`, so returning from Category no longer wipes whatever the user had already typed —
 * found via a Maestro E2E run (`e2e/j4-manual-add.yaml`) that reproduced it exactly: amount and
 * category both silently reset to blank right after picking a category.
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
  active: boolean;
  open: (seed?: AddSheetDraftSeed) => void;
  patch: (fields: Partial<AddSheetDraft>) => void;
  setSubmitting: (submitting: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
};

export const useAddSheetDraft = create<AddSheetDraftStore>((set) => ({
  ...BLANK,
  _initial: BLANK,
  active: false,
  open: (seed) => {
    const full: AddSheetDraft = { ...BLANK, occurredAt: Date.now(), ...seed, dirty: false };
    set({ ...full, _initial: full, active: true });
  },
  patch: (fields) =>
    set((s) => {
      const next = { ...s, ...fields };
      return { ...next, dirty: computeDirty(next, s._initial) };
    }),
  setSubmitting: (submitting) => set({ submitting }),
  setError: (error) => set({ error }),
  reset: () => set({ ...BLANK, _initial: BLANK, active: false }),
}));
