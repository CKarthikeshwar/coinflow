/**
 * Imperative sheet host (SPEC-implementation.md §22.2 / D25). Sheets are not routes — they
 * are opened from anywhere with `open(name, params)`. The full API (mount-once host,
 * `requestClose` discard flow) is specified in §28 and wired with the sheet components in
 * step 5; this is the state container it builds on.
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
