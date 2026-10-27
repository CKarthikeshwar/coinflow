/**
 * FILE PURPOSE
 * ------------
 * The pure shape of what the home-screen widgets read (SPEC-implementation.md §44.2, schema v1). This is the
 * **only** data path into a widget (IMP-091): the native `RemoteViews` providers never compute anything, they
 * just render whatever JSON is here. Keeping the shape and its construction pure and separate from the actual
 * publish (`src/services/widgets/publish.ts`, which reads the database and calls native) makes the numbers a
 * plain input/output function — the same split every other repository/domain pair in this app follows.
 *
 * `incomeMinor` / `spentMinor` / `balanceMinor` must be the *effective* month figures (§41) — the same
 * `analyticsRepo` calls the Analytics card uses — so the widget can never show a different balance than the
 * app itself (IMP-096 holds by construction, not by convention).
 */

export type WidgetPendingItem = {
  id: string;
  amountMinor: number;
  direction: 'debit' | 'credit';
  /** Account/label text, or a placeholder for a partial parse with none. */
  label: string;
};

/**
 * CR-34 (§46.10) — the Balances widget's figures: your accounts' total and the 3 largest balances. Since D50 / CR-41 a
 * balance is the sum of the account's transactions, so it is never old: `updatedAt` and each item's `asOf` are 0, which the
 * widget reads as "say nothing about age" (no "updated … ago", no "· 3d old"). The keys stay so older native code keeps working.
 */
export type WidgetAccounts = {
  totalMinor: number;
  /** how many accounts are in the total (name kept for the native side) */
  knownCount: number;
  updatedAt: number;
  items: { id: string; nickname: string; balanceMinor: number; asOf: number }[];
};

export type WidgetSnapshot = {
  /** stays 1: the additive `accounts` key is ignored by older native code, which rejects any other `v` */
  v: 1;
  updatedAt: number;
  periodStartMs: number;
  periodEndMs: number;
  periodLabel: string;
  incomeMinor: number;
  spentMinor: number;
  balanceMinor: number;
  pending: {
    /** Total pending count — the queue widget's header pill. Can exceed `items.length`. */
    count: number;
    /** At most 3, newest first (§44.2). */
    items: WidgetPendingItem[];
  };
  hideAmounts: boolean;
  accounts: WidgetAccounts;
};

export const WIDGET_SNAPSHOT_MAX_ITEMS = 3;

export type AccountForWidget = {
  id: string;
  nickname: string;
  kind: 'bank' | 'credit_card' | 'wallet' | 'cash';
  archived: boolean;
  balanceMinor: number;
};

/**
 * The complete total (D51, CR-42): bank / wallet / cash accounts (cards are not in the total, D49; archived ones are, their
 * money is still yours) plus the transactions that belong to no account. The rows are the live (non-archived) accounts,
 * largest balance first, ≤ 3.
 */
export function buildWidgetAccounts(accounts: readonly AccountForWidget[], unassignedMinor = 0): WidgetAccounts {
  const inTotal = accounts.filter((a) => a.kind !== 'credit_card');
  const totalMinor = inTotal.reduce((sum, a) => sum + a.balanceMinor, unassignedMinor);
  const counted = inTotal.filter((a) => !a.archived);
  const items = [...counted]
    .sort((a, b) => b.balanceMinor - a.balanceMinor)
    .slice(0, WIDGET_SNAPSHOT_MAX_ITEMS)
    .map((a) => ({ id: a.id, nickname: a.nickname, balanceMinor: a.balanceMinor, asOf: 0 }));
  return { totalMinor, knownCount: counted.length, updatedAt: 0, items };
}

export type PendingSuggestionLike = {
  id: string;
  amountMinor: number | null;
  direction: 'debit' | 'credit' | null;
  account: string | null;
};

/**
 * Builds the snapshot. `pendingSuggestions` must already be newest-first (as `listPending()` returns them) —
 * this function only truncates and reshapes, it never re-sorts. A suggestion still missing its amount/direction
 * (a partial SMS parse) is counted but never shown as a row, since the widget can't render a real number for it.
 */
export function buildWidgetSnapshot(input: {
  now?: number;
  period: { startMs: number; endMsExclusive: number; label: string };
  incomeMinor: number;
  spentMinor: number;
  balanceMinor: number;
  pendingSuggestions: readonly PendingSuggestionLike[];
  hideAmounts: boolean;
  accounts?: readonly AccountForWidget[];
  /** D51 — the signed sum of the transactions with no account; part of the total */
  unassignedMinor?: number;
}): WidgetSnapshot {
  const items: WidgetPendingItem[] = [];
  for (const s of input.pendingSuggestions) {
    if (items.length >= WIDGET_SNAPSHOT_MAX_ITEMS) break;
    if (s.amountMinor == null || s.direction == null) continue;
    items.push({ id: s.id, amountMinor: s.amountMinor, direction: s.direction, label: s.account?.trim() || 'Unknown' });
  }
  return {
    v: 1,
    updatedAt: input.now ?? Date.now(),
    periodStartMs: input.period.startMs,
    periodEndMs: input.period.endMsExclusive,
    periodLabel: input.period.label,
    incomeMinor: input.incomeMinor,
    spentMinor: input.spentMinor,
    balanceMinor: input.balanceMinor,
    pending: { count: input.pendingSuggestions.length, items },
    hideAmounts: input.hideAmounts,
    accounts: buildWidgetAccounts(input.accounts ?? [], input.unassignedMinor ?? 0),
  };
}
