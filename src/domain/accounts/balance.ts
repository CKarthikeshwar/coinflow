/**
 * §46.3 `balance.ts` (D44) — an account's balance is anchored on the bank's own figure: the newest snapshot plus every
 * recorded row after it. We never see an opening balance, so with no snapshot the balance is unknown (`null`), never 0.
 * Pure — no database / React Native.
 */

import type { AccountKind, Direction } from '@/db/schema';

export type BalanceSnapshot = { id: string; balanceMinor: number; asOf: number; acknowledgedAt: number | null };
export type LedgerRow = { amountMinor: number; direction: Direction; occurredAt: number };
export type KnownBalance = { balanceMinor: number; asOf: number };

/** credit `+`, debit `−` — the same for a card's available limit (D49: a spend lowers it, a payment raises it). */
export function signed(row: LedgerRow): number {
  return row.direction === 'credit' ? row.amountMinor : -row.amountMinor;
}

/** Newest first by `asOf`; a tie keeps the later-recorded one first (stable on input order). */
export function newestSnapshot<T extends { asOf: number }>(snapshots: readonly T[]): T | null {
  let best: T | null = null;
  for (const s of snapshots) if (!best || s.asOf >= best.asOf) best = s;
  return best;
}

export function currentBalance(snapshots: readonly BalanceSnapshot[], rows: readonly LedgerRow[]): KnownBalance | null {
  const anchor = newestSnapshot(snapshots);
  if (!anchor) return null;
  const after = rows.filter((r) => r.occurredAt > anchor.asOf).reduce((sum, r) => sum + signed(r), 0);
  return { balanceMinor: anchor.balanceMinor + after, asOf: anchor.asOf };
}

export type AccountForTotal = {
  kind: AccountKind;
  archived: boolean;
  balance: KnownBalance | null;
};

export type TotalBalance = {
  /** bank + wallet + cash accounts with a known balance. Cards are not your money (D49). */
  totalMinor: number;
  knownCount: number;
  unknownCount: number;
  /** the oldest figure in the total — shown as "oldest figure 3 h ago" */
  oldestAsOf: number | null;
  /** Σ known card available limits; null when no card has one */
  creditAvailableMinor: number | null;
};

export function totalBalance(accounts: readonly AccountForTotal[]): TotalBalance {
  let totalMinor = 0;
  let knownCount = 0;
  let unknownCount = 0;
  let oldestAsOf: number | null = null;
  let creditAvailableMinor: number | null = null;
  for (const a of accounts) {
    if (a.archived) continue;
    if (a.kind === 'credit_card') {
      if (a.balance) creditAvailableMinor = (creditAvailableMinor ?? 0) + a.balance.balanceMinor;
      continue;
    }
    if (!a.balance) {
      unknownCount += 1;
      continue;
    }
    knownCount += 1;
    totalMinor += a.balance.balanceMinor;
    oldestAsOf = oldestAsOf === null ? a.balance.asOf : Math.min(oldestAsOf, a.balance.asOf);
  }
  return { totalMinor, knownCount, unknownCount, oldestAsOf, creditAvailableMinor };
}

/** UI-103 — a figure older than this turns amber (an old balance must not look current). */
export const STALE_BALANCE_MS = 3 * 24 * 60 * 60_000;

export function isStale(asOf: number, now: number): boolean {
  return now - asOf > STALE_BALANCE_MS;
}
