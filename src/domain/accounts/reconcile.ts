/**
 * §46.3 `reconcile.ts` (UI-107, D45) — "Needs a look": between two consecutive bank-reported balances, the recorded
 * rows should explain the change. When they do not (by more than ₹1), money moved that the app never saw. Derived on
 * every read, never stored — a late transaction fixes it with no bookkeeping; only "It's fine" is stored
 * (`acknowledgedAt` on the later snapshot). Pure.
 */

import { signed, type BalanceSnapshot, type LedgerRow } from './balance';

export const RECONCILE_TOLERANCE_MINOR = 100;
export const RECONCILE_MAX_PAIRS = 10;
export const RECONCILE_MAX_GAP_MS = 30 * 24 * 60 * 60_000;

export type Discrepancy = {
  /** the later snapshot — "It's fine" acknowledges this one */
  snapshotId: string;
  fromAsOf: number;
  toAsOf: number;
  /** bank figure − what the rows explain: negative ⇒ money left that is not recorded, positive ⇒ it arrived */
  diffMinor: number;
};

export function findDiscrepancies(
  snapshots: readonly BalanceSnapshot[],
  rows: readonly LedgerRow[],
  toleranceMinor: number = RECONCILE_TOLERANCE_MINOR,
): Discrepancy[] {
  const ordered = [...snapshots].sort((a, b) => a.asOf - b.asOf);
  const pairs: [BalanceSnapshot, BalanceSnapshot][] = [];
  for (let i = 1; i < ordered.length; i++) pairs.push([ordered[i - 1], ordered[i]]);

  const out: Discrepancy[] = [];
  for (const [s1, s2] of pairs.slice(-RECONCILE_MAX_PAIRS)) {
    if (s2.acknowledgedAt !== null) continue;
    if (s2.asOf - s1.asOf > RECONCILE_MAX_GAP_MS) continue; // too much can legitimately have happened
    const moved = rows
      .filter((r) => r.occurredAt > s1.asOf && r.occurredAt <= s2.asOf)
      .reduce((sum, r) => sum + signed(r), 0);
    const diffMinor = s2.balanceMinor - (s1.balanceMinor + moved);
    if (Math.abs(diffMinor) > toleranceMinor) {
      out.push({ snapshotId: s2.id, fromAsOf: s1.asOf, toAsOf: s2.asOf, diffMinor });
    }
  }
  return out;
}
