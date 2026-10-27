/**
 * The Analytics tab's filters (SPEC-UI-UX.md §6.10 / CR-27): chosen accounts and hidden categories.
 * In memory only, on purpose — they survive switching period or tab but not closing the app, so a
 * forgotten filter never makes the numbers look wrong on the next launch. Imported directly by the
 * Analytics screen and its sheets (not re-exported from `@/stores`, like `analytics-period.ts`).
 */

import { create } from 'zustand';

import { type AnalyticsFilter, type CategoryKind, EMPTY_FILTER, toggleId } from '@/domain/analytics-filter';

type AnalyticsFilterStore = AnalyticsFilter & {
  setAccounts: (ids: string[]) => void;
  toggleHidden: (kind: CategoryKind, id: string) => void;
  setHidden: (kind: CategoryKind, ids: string[]) => void;
  /** Show every hidden category — of one kind, or both when omitted. */
  showAll: (kind?: CategoryKind) => void;
  reset: () => void;
};

export const useAnalyticsFilter = create<AnalyticsFilterStore>((set) => ({
  ...EMPTY_FILTER,
  setAccounts: (ids) => set({ accountIds: ids }),
  toggleHidden: (kind, id) =>
    set((s) =>
      kind === 'expense' ? { hiddenExpense: toggleId(s.hiddenExpense, id) } : { hiddenIncome: toggleId(s.hiddenIncome, id) },
    ),
  setHidden: (kind, ids) => set(kind === 'expense' ? { hiddenExpense: ids } : { hiddenIncome: ids }),
  showAll: (kind) =>
    set(kind === 'expense' ? { hiddenExpense: [] } : kind === 'income' ? { hiddenIncome: [] } : { hiddenExpense: [], hiddenIncome: [] }),
  reset: () => set({ ...EMPTY_FILTER }),
}));
