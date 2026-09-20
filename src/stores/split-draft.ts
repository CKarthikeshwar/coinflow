/**
 * FILE PURPOSE
 * ------------
 * The in-progress split shared between the **Split sheet** and the sheet that opened it
 * (Confirm / Edit — `TransactionSheetBody`), or the Details screen (SPEC-UI-UX.md §6.17 / §6.4 / §6.8).
 * Never persisted (§22.2): it only lives while the parent sheet session lives. Same idea as
 * `useAddSheetDraft`: the Split sheet *replaces* its parent in the single `SheetHost`, so whatever the
 * user has done has to survive the parent unmounting and coming back.
 *
 * TWO LAYERS
 * ----------
 * - **committed** — what the parent will write when *it* is saved (`null` = no split). The parent's
 *   "Split with N · ₹X yours" row reads this, and the parent's Save persists it
 *   (`features/splits/persist-split.ts`). A Cancel on the parent throws it away — nothing about a split
 *   touches the database until then (in Confirm the transaction doesn't even exist yet).
 * - **the working state** (`stage`, `people`, `mode`, `overrides`) — what the Split sheet is editing right now.
 *   *Done* on the Amounts stage turns it into `committed`.
 *
 * All the arithmetic lives in `@/domain/split-draft`; this store only holds state.
 */

import { create } from 'zustand';

import { computeSplitDraft, YOU_KEY, type SplitMode } from '@/domain/split-draft';

export type DraftPersonSource = 'contact' | 'manual' | 'sms';

export type DraftPerson = {
  /** Stable row key: the saved person's id, else `n:<10-digit key>` for someone typed in / picked from contacts. */
  key: string;
  /** Set when this is already a saved `person` row. */
  personId: string | null;
  name: string;
  /** Any spelling of the mobile number (normalised again when saved). */
  phone: string | null;
  contactRef: string | null;
  source: DraftPersonSource;
};

export type CommittedShare = DraftPerson & {
  amountMinor: number;
  /** An existing share you have waived (absorbed) — it still counts in the split, but not as owed to you. */
  waived?: boolean;
};

export type SplitStage = 'people' | 'amounts';

/** What `TransactionSheetBody` / Details needs to write once the parent is saved. */
export type PendingSplit = {
  committed: CommittedShare[] | null;
  existingSplitId: string | null;
  removed: boolean;
  /** Send the request SMS after saving (the user did not press *Don't send now*). */
  send: boolean;
};

type SplitDraftStore = {
  totalMinor: number;
  /** Edit mode / Details: the split row that already exists for this transaction. */
  existingSplitId: string | null;
  committed: CommittedShare[] | null;
  /** The user removed an existing split — persist as a delete. */
  removed: boolean;
  /** The user changed the split in this session (so the parent's Cancel / swipe must ask before discarding it). */
  dirty: boolean;
  /** Send request SMS when the split is saved; the small *Don't send now* button turns it off for this split. */
  sendOnSave: boolean;

  stage: SplitStage;
  people: DraftPerson[];
  mode: SplitMode;
  overrides: Record<string, number>;

  /** Seeds `committed` from an existing split (Edit / Details). Amounts are paise. */
  seedExisting: (existing: { splitId: string; shares: (DraftPerson & { amountMinor: number; waived?: boolean })[] } | null) => void;
  /** Called when the Split sheet opens: (re)builds the working state from `committed`. */
  begin: (totalMinor: number) => void;
  togglePerson: (person: DraftPerson) => void;
  removePerson: (key: string) => void;
  goAmounts: () => void;
  goPeople: () => void;
  setMode: (mode: SplitMode) => void;
  /** `null` clears the override (the row becomes "free" again). */
  setOverride: (key: string, value: number | null) => void;
  resetEqual: () => void;
  /** Turns the working state into `committed`; returns false when it is not balanced / valid. */
  commit: () => boolean;
  /** Drops the split (an existing one is deleted when the parent saves). */
  removeSplit: () => void;
  setSendOnSave: (send: boolean) => void;
  pending: () => PendingSplit;
  reset: () => void;
};

const EMPTY = {
  totalMinor: 0,
  existingSplitId: null,
  committed: null,
  removed: false,
  dirty: false,
  sendOnSave: true,
  stage: 'people' as SplitStage,
  people: [] as DraftPerson[],
  mode: 'rupee' as SplitMode,
  overrides: {} as Record<string, number>,
};

export const useSplitDraft = create<SplitDraftStore>((set, get) => ({
  ...EMPTY,

  seedExisting: (existing) =>
    set(
      existing
        ? { existingSplitId: existing.splitId, committed: existing.shares, removed: false, dirty: false }
        : { existingSplitId: null, committed: null, removed: false, dirty: false },
    ),

  begin: (totalMinor) => {
    const { committed } = get();
    if (committed && committed.length > 0) {
      // Editing: keep every person's committed amount fixed (custom); You absorb whatever is left.
      set({
        totalMinor,
        stage: 'amounts',
        mode: 'rupee',
        people: committed.map(({ amountMinor: _a, ...p }) => p),
        overrides: Object.fromEntries(committed.map((c) => [c.key, c.amountMinor])),
      });
    } else {
      set({ totalMinor, stage: 'people', mode: 'rupee', people: [], overrides: {} });
    }
  },

  togglePerson: (person) =>
    set((s) => {
      const present = s.people.some((p) => p.key === person.key);
      const people = present ? s.people.filter((p) => p.key !== person.key) : [...s.people, person];
      const overrides = { ...s.overrides };
      if (present) delete overrides[person.key];
      return { people, overrides };
    }),

  removePerson: (key) =>
    set((s) => {
      const overrides = { ...s.overrides };
      delete overrides[key];
      return { people: s.people.filter((p) => p.key !== key), overrides };
    }),

  goAmounts: () => set((s) => (s.people.length > 0 ? { stage: 'amounts' } : s)),
  goPeople: () => set({ stage: 'people' }),
  setMode: (mode) => set((s) => (s.mode === mode ? s : { mode, overrides: {} })),
  setOverride: (key, value) =>
    set((s) => {
      const overrides = { ...s.overrides };
      if (value === null) delete overrides[key];
      else overrides[key] = value;
      return { overrides };
    }),
  resetEqual: () => set({ overrides: {} }),

  commit: () => {
    const s = get();
    const result = computeSplitDraft({
      totalMinor: s.totalMinor,
      personKeys: s.people.map((p) => p.key),
      mode: s.mode,
      overrides: s.overrides,
    });
    if (!result.canSave) return false;
    const byKey = new Map(result.rows.map((r) => [r.key, r.amountMinor]));
    set({
      committed: s.people.map((p) => ({ ...p, amountMinor: byKey.get(p.key) ?? 0 })),
      removed: false,
      dirty: true,
    });
    return true;
  },

  removeSplit: () => set((s) => ({ committed: null, removed: s.existingSplitId !== null, dirty: true })),

  setSendOnSave: (send) => set({ sendOnSave: send }),

  pending: () => {
    const { committed, existingSplitId, removed, sendOnSave } = get();
    return { committed, existingSplitId, removed, send: sendOnSave };
  },

  reset: () => set({ ...EMPTY }),
}));

export { YOU_KEY };
