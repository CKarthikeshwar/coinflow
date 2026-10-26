/**
 * UI-109 — the account names a list of transactions needs: "HDFC ··672" for the meta line, and
 * "SBI ··1234 → HDFC ··672" for a transfer row (whose other half lives on a different row).
 */

import { useAccounts } from '@/db/repositories/accounts';
import { usePeerAccounts } from '@/db/repositories/transfers';
import type { Transaction } from '@/db/schema';

import { accountName } from './account-label';

export function useAccountLabels(rows: readonly Transaction[]) {
  const { data: accounts } = useAccounts();
  const byId = new Map((accounts ?? []).map((a) => [a.id, a]));
  const peers = usePeerAccounts(rows.flatMap((r) => (r.transferPeerId ? [r.transferPeerId] : [])));
  const nameOf = (id: string | null | undefined) => accountName(id ? byId.get(id) : null);

  return {
    /** The row's own account, or undefined for "No account" (nothing is added to the line). */
    account: (t: Transaction): string | undefined => (t.accountId && byId.has(t.accountId) ? nameOf(t.accountId) : undefined),
    /** "SBI ··1234 → HDFC ··672" for a linked transfer, "From SBI ··1234" for a single-sided one. */
    transfer: (t: Transaction): string | undefined => {
      if (t.type !== 'transfer') return undefined;
      const peerAccount = t.transferPeerId ? peers.get(t.transferPeerId) : undefined;
      if (peerAccount === undefined) return t.direction === 'debit' ? `From ${nameOf(t.accountId)}` : `Into ${nameOf(t.accountId)}`;
      const [from, to] = t.direction === 'debit' ? [t.accountId, peerAccount] : [peerAccount, t.accountId];
      return `${nameOf(from)} → ${nameOf(to)}`;
    },
  };
}
