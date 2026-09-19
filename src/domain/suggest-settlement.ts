/**
 * FILE PURPOSE
 * ------------
 * Ranks the open shares / requests a payment might settle and (rarely) names one as the best guess
 * (SPEC-implementation.md §40.4, IMP-085). PURE and advisory: it never writes anything — the Merge sheet
 * and the "Suggested settlement" banner only ever *offer* the result, the user always confirms.
 *
 * THE RULE
 * --------
 * `best` exists only when exactly ONE candidate's remaining amount equals the transaction amount AND —
 * when the transaction carries an account/name (a UPI payer, say) — that candidate's person name matches
 * it. Otherwise `best` is `null` and the list is simply ordered by how close each remaining amount is.
 */

import { normalizeAccount } from './normalize';

export type SettlementCandidate = {
  id: string;
  /** Display name of the person the share/request is with. */
  personName: string;
  /** What is still owed. */
  remainingMinor: number;
};

export type SettlementSuggestion = {
  /** Candidate ids, best first. */
  orderedIds: string[];
  /** The single confident match, or `null`. */
  bestId: string | null;
};

/** Words too generic to count as a name match ("upi", "mr", …). */
const STOP = new Set(['upi', 'mr', 'mrs', 'ms', 'shri', 'smt', 'dr', 'the']);

function nameTokens(name: string): string[] {
  return normalizeAccount(name)
    .split(/[\s@._-]+/)
    .filter((t) => t.length >= 3 && !STOP.has(t));
}

/** True when any meaningful word of the person's name appears in the transaction's account text. */
export function nameMatches(account: string | null | undefined, personName: string): boolean {
  const normalizedAccount = normalizeAccount(account);
  if (!normalizedAccount) return false;
  return nameTokens(personName).some((t) => normalizedAccount.includes(t));
}

export function suggestSettlement(
  txn: { amountMinor: number; account?: string | null },
  candidates: readonly SettlementCandidate[],
): SettlementSuggestion {
  const ordered = [...candidates].sort((a, b) => {
    const da = Math.abs(a.remainingMinor - txn.amountMinor);
    const db = Math.abs(b.remainingMinor - txn.amountMinor);
    return da - db || a.personName.localeCompare(b.personName) || a.id.localeCompare(b.id);
  });

  const exact = candidates.filter((c) => c.remainingMinor === txn.amountMinor);
  let bestId: string | null = null;
  if (exact.length === 1) {
    const hasAccount = normalizeAccount(txn.account).length > 0;
    if (!hasAccount || nameMatches(txn.account, exact[0].personName)) bestId = exact[0].id;
  }
  return { orderedIds: ordered.map((c) => c.id), bestId };
}
