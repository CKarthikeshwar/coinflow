/**
 * FILE PURPOSE
 * ------------
 * Tracks which bottom sheet (Add, Edit, Confirm, Filter, category picker, ...) is currently
 * open, anywhere in the app. Sheets in this app are NOT expo-router routes/screens — they're
 * plain components that any part of the app can pop open by calling `open('add')` (etc.) on
 * this store, without needing to navigate anywhere.
 *
 * WHERE IT FITS
 * -------------
 * `src/features/app-shell/sheet-host.tsx` is mounted once, near the root of the app (see
 * `_layout.tsx`), and watches this store's `current` value to decide which sheet component (if
 * any) to actually render. Any button anywhere in the app that should open a sheet — e.g. the
 * Home screen's "+" button, a transaction row's "Edit" action — just calls
 * `useSheetRegistry.getState().open('add', { ... })` rather than navigating to a route.
 *
 * IMPORTANT
 * ---------
 * `requestClose` (used by the hardware back button / swipe-to-dismiss gesture in `SheetHost`)
 * is deliberately NOT the same as `close` — it routes through whatever the currently-open
 * sheet's own Cancel handler is (registered via `setOnRequestClose` while that sheet is
 * mounted), so a back-gesture triggers the exact same "discard unsaved changes?" confirmation
 * as tapping the sheet's own Cancel button would. Calling `close()` directly bypasses that
 * check entirely — it should only be used when there's deliberately nothing to guard (e.g. a
 * sheet like the plain category picker, which has no draft data of its own to lose).
 */

import { create } from 'zustand';

export type SheetName =
  | 'add'
  | 'edit'
  | 'confirm'
  | 'filter'
  | 'categoryPicker'
  | 'createCategory'
  | 'editCategory'
  | 'editAccountRule';

type SheetRegistryStore = {
  current: SheetName | null;
  params: Record<string, unknown>;
  open: (name: SheetName, params?: Record<string, unknown>) => void;
  close: () => void;
  /**
   * The active sheet body's own Cancel handler (dirty-check + discard-confirm, V-6) — each
   * sheet body registers itself here while mounted and clears it on unmount. `requestClose`
   * calls this instead of closing directly, so anything that isn't the sheet's own Cancel
   * button (the hardware/gesture back handler in `SheetHost`, today) gets the exact same
   * discard guard rather than bypassing it. Falls back to a plain close for sheets that don't
   * register one (nothing to guard, e.g. `categoryPicker`).
   */
  onRequestClose: (() => void) | null;
  setOnRequestClose: (handler: (() => void) | null) => void;
  requestClose: () => void;
};

export const useSheetRegistry = create<SheetRegistryStore>((set, get) => ({
  current: null,
  params: {},
  onRequestClose: null,
  open: (name, params = {}) => set({ current: name, params }),
  close: () => set({ current: null, params: {} }),
  setOnRequestClose: (handler) => set({ onRequestClose: handler }),
  requestClose: () => {
    const handler = get().onRequestClose;
    if (handler) handler();
    else set({ current: null, params: {} });
  },
}));
