/**
 * FILE PURPOSE
 * ------------
 * Live (auto-refreshing) reads of split data for the screens (SPEC-implementation.md §43.1 / §21.7):
 * the Details split card and the list badges. The plain functions in `splits.ts` are one-shot; these wrap
 * them so a screen re-renders the moment a split, share, settlement or person changes — including from a
 * background task.
 *
 * The split tables are tiny (a handful of rows per shared transaction), so a hook subscribes to whole
 * tables and derives its view in JS rather than building a bespoke join per screen.
 */

import { eq, isNotNull } from 'drizzle-orm';
import { useMemo } from 'react';

import { buildSplitBadges, type SplitBadge } from '@/domain/split-badge';
import { useLiveQuery } from '@/hooks/use-live-query';

import { db } from '../client';
import { persons, settlements, splitRequestsIn, splitShares, splits, transactions } from '../schema';
import { listSettlementsForTransaction, type SettlementLine } from './settlements';
import { listRequestsByStatus, listOpenRequests, listSettledRequests, type RequestView } from './split-requests';
import {
  getSplitForTransaction,
  groupOwedByPerson,
  listOpenShares,
  listSettledShares,
  type OwedGroup,
  type OwedItem,
  type SplitView,
} from './splits';

/** The split on one transaction (shares, people, derived state), or `undefined`. Re-renders on any change. */
export function useSplitForTransaction(transactionId: string | undefined): SplitView | undefined {
  const s = useLiveQuery(db.select().from(splits));
  const sh = useLiveQuery(db.select().from(splitShares));
  const st = useLiveQuery(db.select().from(settlements));
  const p = useLiveQuery(db.select().from(persons));
  return useMemo(
    () => (transactionId ? getSplitForTransaction(transactionId) : undefined),
    // the data arrays are the change signal: any write to these tables produces a new array
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [transactionId, s.data, sh.data, st.data, p.data],
  );
}

/** One badge per shared transaction (transaction id → badge), for list rows. */
export function useSplitBadges(): Map<string, SplitBadge> {
  const sp = useLiveQuery(
    db
      .select({ transactionId: splits.transactionId, splitId: splits.id, amountMinor: transactions.amountMinor })
      .from(splits)
      .innerJoin(transactions, eq(transactions.id, splits.transactionId)),
  );
  const sh = useLiveQuery(
    db.select({ id: splitShares.id, splitId: splitShares.splitId, amountMinor: splitShares.amountMinor, waivedAt: splitShares.waivedAt }).from(splitShares),
  );
  const st = useLiveQuery(db.select({ shareId: settlements.shareId, amountMinor: settlements.amountMinor }).from(settlements));
  return useMemo(() => buildSplitBadges(sp.data, sh.data, st.data), [sp.data, sh.data, st.data]);
}

export type SplitsOverview = {
  /** Open shares grouped by person, largest outstanding first. */
  owed: OwedGroup[];
  owedSettled: OwedItem[];
  owedTotalMinor: number;
  /** Accepted requests you still owe, oldest first. */
  youOwe: RequestView[];
  youOweSettled: RequestView[];
  youOweTotalMinor: number;
  unattended: RequestView[];
  accepted: RequestView[];
  /** `false` until every subscribed table has answered once. */
  ready: boolean;
};

/**
 * Everything the Splits page and Home's "Owed to you" row show, live (SPEC-UI-UX §6.19). The split tables are
 * tiny, so like the other hooks here it subscribes to whole tables (plus the deleted transactions, so deleting a
 * shared transaction takes its shares off the page) and derives the view in JS.
 */
export function useSplitsOverview(): SplitsOverview {
  const s = useLiveQuery(db.select({ id: splits.id }).from(splits));
  const sh = useLiveQuery(db.select().from(splitShares));
  const st = useLiveQuery(db.select().from(settlements));
  const p = useLiveQuery(db.select({ id: persons.id, name: persons.displayName }).from(persons));
  const rq = useLiveQuery(db.select().from(splitRequestsIn));
  const del = useLiveQuery(db.select({ id: transactions.id }).from(transactions).where(isNotNull(transactions.deletedAt)));

  const ready = [s, sh, st, p, rq, del].every((q) => q.updatedAt !== undefined);
  return useMemo(() => {
    const open = listOpenShares();
    const requests = listOpenRequests();
    return {
      owed: groupOwedByPerson(open),
      owedSettled: listSettledShares(),
      owedTotalMinor: open.reduce((a, i) => a + i.remainingMinor, 0),
      youOwe: requests,
      youOweSettled: listSettledRequests(),
      youOweTotalMinor: requests.reduce((a, r) => a + r.remainingMinor, 0),
      unattended: listRequestsByStatus(['unattended']),
      accepted: listRequestsByStatus(['accepted']),
      ready,
    };
    // the data arrays are the change signal: any write to these tables produces a new array
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.data, sh.data, st.data, p.data, rq.data, del.data, ready]);
}

/** What one transaction has settled (Details › "Settlements"), and how much of it is still unallocated. Live. */
export function useSettlementsForTransaction(transactionId: string | undefined): {
  lines: SettlementLine[];
  allocatedMinor: number;
} {
  const st = useLiveQuery(db.select().from(settlements));
  const sh = useLiveQuery(db.select({ id: splitShares.id }).from(splitShares));
  const rq = useLiveQuery(db.select({ id: splitRequestsIn.id, at: splitRequestsIn.updatedAt }).from(splitRequestsIn));
  const p = useLiveQuery(db.select({ id: persons.id, name: persons.displayName }).from(persons));
  return useMemo(() => {
    if (!transactionId) return { lines: [], allocatedMinor: 0 };
    const lines = listSettlementsForTransaction(transactionId);
    return { lines, allocatedMinor: lines.reduce((a, l) => a + l.amountMinor, 0) };
    // the data arrays are the change signal: any write to these tables produces a new array
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactionId, st.data, sh.data, rq.data, p.data]);
}
