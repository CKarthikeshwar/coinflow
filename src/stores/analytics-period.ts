/**
 * `useAnalyticsPeriod` — SPEC-implementation.md §30.12 (F9). Holds the Analytics screen's
 * current period (Month/Week mode + the stepped anchor).
 *
 * Starts on the current month, always — it deliberately does **not** read the persisted
 * `analyticsPeriodMode` setting (§19.5) here at store-creation time. Zustand's `create()` runs
 * its initializer the moment this module is first evaluated, which — via the `@/stores` barrel
 * `_layout.tsx` imports at the very top of the app (through `SheetHost`) — happens before
 * `<MigrationGate>` has run migrations. A synchronous `db.select()` that early would read an
 * unmigrated table. The Analytics screen itself hydrates the persisted mode in a `useEffect` on
 * mount instead (it only ever renders after the gate has passed), calling `setMode` once.
 */

import { create } from 'zustand';

import { setSetting } from '@/db/repositories/settings';
import { isoWeekPeriod, monthPeriod, stepPeriod, type Period } from '@/domain/period';

function periodForMode(mode: Period['mode']): Period {
  return mode === 'week' ? isoWeekPeriod() : monthPeriod();
}

type AnalyticsPeriodStore = {
  period: Period;
  /** `persist:false` on the mount-time hydration call — the mode is already what's stored, no
   * need to write it back to the DB it just came from. */
  setMode: (mode: Period['mode'], persist?: boolean) => void;
  step: (dir: -1 | 1) => void;
};

export const useAnalyticsPeriod = create<AnalyticsPeriodStore>((set, get) => ({
  period: monthPeriod(),
  setMode: (mode, persist = true) => {
    if (get().period.mode === mode) return;
    if (persist) setSetting('analyticsPeriodMode', mode);
    set({ period: periodForMode(mode) });
  },
  step: (dir) => set((s) => ({ period: stepPeriod(s.period, dir) })),
}));
