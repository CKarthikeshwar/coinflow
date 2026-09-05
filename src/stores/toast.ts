/**
 * FILE PURPOSE
 * ------------
 * A single, app-wide "toast" banner — a short message with one optional action button that
 * auto-dismisses after a few seconds. Used for confirmations like "Added · View" after saving a
 * transaction from the Add/Confirm sheet.
 *
 * WHERE IT FITS
 * -------------
 * `src/ui/toast.tsx` renders whatever's currently in this store (mounted once near the app
 * root). Any feature calls `useToast.getState().show(message, action)` to display one — there's
 * only ever one toast on screen at a time; calling `show()` again while one is already visible
 * replaces it rather than queueing a second one.
 *
 * Same shape/pattern as `undo.ts`'s snackbar (a message + one action + an auto-hide timer) — but
 * kept as its own separate store rather than merged with it, since a toast's action is generic
 * (any label/callback) while undo's is specifically "restore this one transaction," and they can
 * legitimately need to be on screen closer together than sharing one store would cleanly allow.
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
