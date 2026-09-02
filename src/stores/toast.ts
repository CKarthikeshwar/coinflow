/**
 * Toast state (SPEC-implementation.md §30.6/§30.7 — Add/Confirm's post-save "Added … · View").
 * Same shape as `undo.ts`'s snackbar (message + one action + auto-hide timer), generalized: any
 * feature can show one, but only one shows at a time — a new `show()` replaces whatever's up.
 */

import { create } from 'zustand';

const TOAST_DURATION_MS = 3000;

type ToastAction = { label: string; onPress: () => void };

type ToastStore = {
  message: string | null;
  action: ToastAction | null;
  show: (message: string, action?: ToastAction) => void;
  clear: () => void;
};

let timer: ReturnType<typeof setTimeout> | null = null;

export const useToast = create<ToastStore>((set) => ({
  message: null,
  action: null,
  show: (message, action) => {
    if (timer) clearTimeout(timer);
    set({ message, action: action ?? null });
    timer = setTimeout(() => {
      timer = null;
      set({ message: null, action: null });
    }, TOAST_DURATION_MS);
  },
  clear: () => {
    if (timer) clearTimeout(timer);
    timer = null;
    set({ message: null, action: null });
  },
}));
