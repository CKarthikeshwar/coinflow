/**
 * Undo snackbar state (SPEC-implementation.md §22.2 / §27.4). The row data is already safe
 * via soft-delete, so this never holds row content — just the id and the auto-hide timer.
 * Undo calls `restoreTransaction`; timeout just clears the snackbar (purge happens on
 * launch).
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
