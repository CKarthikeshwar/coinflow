/**
 * FILE PURPOSE
 * ------------
 * What the Transactions list / Home "Recent" show under a shared transaction: the small
 * "Split · 1 of 3 paid" line and the muted "Your share ₹300" (SPEC-UI-UX.md §6.7, UI-075).
 * Pure: it turns already-fetched rows into one badge per shared transaction.
 */

import { shareState } from './split';

export type SplitBadge = {
  /** Shares still counting (waived ones are excluded — you absorbed them). */
  total: number;
  /** Of those, how many are fully settled. */
  paid: number;
  /** amount − Σ NON-waived shares: what this payment really cost you (a waived share is one you absorbed). */
  yourMinor: number;
};

type SplitRow = { transactionId: string; splitId: string; amountMinor: number };
type ShareRow = { id: string; splitId: string; amountMinor: number; waivedAt: number | null };
type SettlementRow = { shareId: string | null; amountMinor: number };

/** One badge per shared transaction, keyed by transaction id. */
export function buildSplitBadges(
  splits: readonly SplitRow[],
  shares: readonly ShareRow[],
  settlements: readonly SettlementRow[],
): Map<string, SplitBadge> {
  const settledByShare = new Map<string, number>();
  for (const s of settlements) {
    if (s.shareId) settledByShare.set(s.shareId, (settledByShare.get(s.shareId) ?? 0) + s.amountMinor);
  }
  const sharesBySplit = new Map<string, ShareRow[]>();
  for (const sh of shares) {
    const list = sharesBySplit.get(sh.splitId) ?? [];
    list.push(sh);
    sharesBySplit.set(sh.splitId, list);
  }
  const out = new Map<string, SplitBadge>();
  for (const sp of splits) {
    const mine = sharesBySplit.get(sp.splitId) ?? [];
    const counting = mine.filter((s) => !s.waivedAt);
    out.set(sp.transactionId, {
      total: counting.length,
      paid: counting.filter((s) => shareState(s, settledByShare.get(s.id) ?? 0) === 'settled').length,
      yourMinor: Math.max(0, sp.amountMinor - counting.reduce((a, s) => a + s.amountMinor, 0)),
    });
  }
  return out;
}

/** `Split · 1 of 3 paid` — or `Split · all paid` when everyone has, `Split` when nobody counts. */
export function splitBadgeLabel(badge: SplitBadge): string {
  if (badge.total === 0) return 'Split';
  if (badge.paid === badge.total) return 'Split · all paid';
  return `Split · ${badge.paid} of ${badge.total} paid`;
}
