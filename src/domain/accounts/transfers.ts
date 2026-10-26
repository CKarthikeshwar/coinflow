/**
 * §46.3 `matchTransfer` (D47) — does a just-saved row have a twin on another of your accounts, i.e. money that moved
 * between two of your own accounts rather than being spent / earned? Auto-link only when it is unambiguous; otherwise
 * ask (a Review Queue card). A wrong silent link hides real spending, a missed link only shows two rows.
 */

import type { Direction } from '@/db/schema';

export const TRANSFER_WINDOW_MS = 15 * 60_000;

export type TransferRow = {
  id: string;
  amountMinor: number;
  direction: Direction;
  type: string;
  accountId: string | null;
  occurredAt: number;
  source: 'manual' | 'sms';
  transferPeerId: string | null;
  deletedAt: number | null;
};

export type TransferMatch =
  | { kind: 'link'; peer: TransferRow }
  | { kind: 'ask'; peers: TransferRow[] }
  | { kind: 'none' };

/** A row that could be one side of a transfer at all. */
export function isLinkable(row: TransferRow): boolean {
  return (
    row.deletedAt === null &&
    row.transferPeerId === null &&
    row.accountId !== null &&
    (row.type === 'expense' || row.type === 'income')
  );
}

/** The candidates (other rows) that could be `row`'s other half. */
export function transferCandidates(row: TransferRow, candidates: readonly TransferRow[]): TransferRow[] {
  if (!isLinkable(row)) return [];
  return candidates.filter(
    (c) =>
      c.id !== row.id &&
      isLinkable(c) &&
      c.direction !== row.direction &&
      c.amountMinor === row.amountMinor &&
      c.accountId !== row.accountId &&
      Math.abs(c.occurredAt - row.occurredAt) <= TRANSFER_WINDOW_MS,
  );
}

export function matchTransfer(row: TransferRow, candidates: readonly TransferRow[]): TransferMatch {
  const peers = transferCandidates(row, candidates);
  if (peers.length === 0) return { kind: 'none' };
  // unambiguous only both ways: one debit and two matching credits is still a guess when seen from either credit
  const others = candidates.some((c) => c.id === row.id) ? candidates : [...candidates, row];
  const unique = peers.length === 1 && transferCandidates(peers[0], others).length === 1;
  if (unique && (row.source === 'sms' || peers[0].source === 'sms')) {
    return { kind: 'link', peer: peers[0] };
  }
  return { kind: 'ask', peers };
}

/** Order-independent key for a pair, used for the "No, not a transfer" memory. */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}
