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
  | 'editCategory';

type SheetRegistryStore = {
  current: SheetName | null;
  params: Record<string, unknown>;
  open: (name: SheetName, params?: Record<string, unknown>) => void;
  close: () => void;
  /** step 5 routes this through the discard-confirm when the sheet is dirty (V-6) */
  requestClose: () => void;
};

export const useSheetRegistry = create<SheetRegistryStore>((set) => ({
  current: null,
  params: {},
  open: (name, params = {}) => set({ current: name, params }),
  close: () => set({ current: null, params: {} }),
  requestClose: () => set({ current: null, params: {} }),
}));
