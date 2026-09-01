/**
 * The Add / Edit / Confirmation working copy (SPEC-implementation.md §22.2). Ephemeral —
 * never persisted, cleared on sheet close. `dirty` drives the discard-confirm (V-6).
 * The exact field set firms up with the sheets in step 5 (§22.6).
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

type AddSheetDraftStore = AddSheetDraft & {
  open: (seed?: AddSheetDraftSeed) => void;
  patch: (fields: Partial<AddSheetDraft>) => void;
  setSubmitting: (submitting: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
};

export const useAddSheetDraft = create<AddSheetDraftStore>((set) => ({
  ...BLANK,
  open: (seed) => set({ ...BLANK, occurredAt: Date.now(), ...seed, dirty: false }),
  patch: (fields) => set((s) => ({ ...s, ...fields, dirty: true })),
  setSubmitting: (submitting) => set({ submitting }),
  setError: (error) => set({ error }),
  reset: () => set({ ...BLANK }),
}));
