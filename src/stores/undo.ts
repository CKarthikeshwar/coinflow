/**
 * FILE PURPOSE
 * ------------
 * Tracks the "Deleted · Undo" snackbar shown after deleting a transaction, and the 5-second
 * window during which the user can tap Undo to bring it back.
 *
 * WHERE IT FITS
 * -------------
 * `src/ui/undo-snackbar.tsx` renders the snackbar based on this store; `undo-host.tsx`
 * (`src/features/transactions/`) wires the actual "Undo" tap to
 * `restoreTransaction(transactionId)` (`src/db/repositories/transactions.ts`).
 *
 * IMPORTANT
 * ---------
 * This store only ever holds the deleted transaction's ID, never any of its actual data (amount,
 * account, etc.) — that's not an accident. The transaction row is already safe: deleting it is a
 * soft-delete (`deletedAt` set, not actually removed from the database — see `schema.ts`), so
 * "undo" just means clearing that timestamp back to `null`. There's no need for this store to
 * carry a copy of the row's data, which also means there's nothing sensitive sitting in memory
 * here for longer than necessary. If the 5-second window expires without the user tapping Undo,
 * this store simply clears itself — the actual permanent deletion happens later and separately,
 * via `src/db/maintenance.ts`'s `purge()` at the next app launch, not from a timeout here.
 */

import { create } from 'zustand';

const UNDO_WINDOW_MS = 5000;

type UndoStore = {
  transactionId: string | null;
  show: (transactionId: string, onExpire?: () => void) => void;
  clear: () => void;
};

let timer: ReturnType<typeof setTimeout> | null = null;

export const useUndo = create<UndoStore>((set) => ({
  transactionId: null,
  show: (transactionId, onExpire) => {
    if (timer) clearTimeout(timer);
    set({ transactionId });
    timer = setTimeout(() => {
      timer = null;
      set({ transactionId: null });
      onExpire?.();
    }, UNDO_WINDOW_MS);
  },
  clear: () => {
    if (timer) clearTimeout(timer);
    timer = null;
    set({ transactionId: null });
  },
}));
