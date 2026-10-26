/**
 * FILE PURPOSE
 * ------------
 * The `balanceRepo` — bank-reported balances (`account_balance`, SPEC-implementation.md §46.2 / §46.7, D44): written
 * at SMS ingest (`source: 'sms'`, `asOf` = when the text arrived) or typed by the user (`source: 'manual'`,
 * `asOf` = now). A balance is never stored as "the" balance — `domain/accounts/balance.ts` derives the current figure
 * from the newest snapshot plus the rows after it, and `reconcile.ts` derives **Needs a look** (D45).
 *
 * The ledger the derivations read is every saved transaction on the account **plus its pending suggestions** (an SMS
 * still in the Review Queue already moved the money; leaving it out would show a false "Needs a look" until it is
 * saved). Confirmed / dismissed suggestions are not counted (the first is its transaction, the second never happened).
 *
 * D48: balances never leave the device — not logged, not in crash reports.
 */

import { and, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { randomUUID } from 'expo-crypto';
import { useState } from 'react';

import { currentBalance, isStale, type BalanceSnapshot, type KnownBalance, type LedgerRow } from '@/domain/accounts/balance';
import { findDiscrepancies, type Discrepancy } from '@/domain/accounts/reconcile';
import { useLiveQuery } from '@/hooks/use-live-query';

import { db } from '../client';
import { accountBalances, myAccounts, suggestions, transactions, type AccountBalance, type MyAccount } from '../schema';

/** §46.2 retention: per account the newest 200, and nothing older than 90 days except the newest one. */
export const SNAPSHOT_KEEP_COUNT = 200;
export const SNAPSHOT_KEEP_MS = 90 * 24 * 60 * 60_000;

export type RecordSnapshotInput = {
  accountId: string;
  balanceMinor: number;
  asOf: number;
  source: 'sms' | 'manual';
};

/** Idempotent on `accountId:asOf:balanceMinor` — the reconcile sweep re-reading the same SMS adds nothing. */
export function recordSnapshot(input: RecordSnapshotInput): { created: boolean } {
  const res = db
    .insert(accountBalances)
    .values({
      id: randomUUID(),
      accountId: input.accountId,
      balanceMinor: input.balanceMinor,
      asOf: input.asOf,
      source: input.source,
      dedupeKey: `${input.accountId}:${input.asOf}:${input.balanceMinor}`,
      acknowledgedAt: null,
    })
    .onConflictDoNothing({ target: accountBalances.dedupeKey })
    .run();
  return { created: (res.changes ?? 0) > 0 };
}

/** UI-107 "It's fine": hides the discrepancy that ends at this snapshot. The balance itself is unaffected. */
export function acknowledgeDiscrepancy(snapshotId: string): void {
  db.update(accountBalances).set({ acknowledgedAt: Date.now() }).where(eq(accountBalances.id, snapshotId)).run();
}

export function purgeOldSnapshots(now: number = Date.now()): void {
  const accountIds = db.selectDistinct({ id: accountBalances.accountId }).from(accountBalances).all();
  for (const { id } of accountIds) {
    const keep = db
      .select({ id: accountBalances.id })
      .from(accountBalances)
      .where(eq(accountBalances.accountId, id))
      .orderBy(desc(accountBalances.asOf))
      .limit(SNAPSHOT_KEEP_COUNT)
      .all()
      .map((r) => r.id);
    const newest = keep[0];
    if (!newest) continue;
    db.delete(accountBalances)
      .where(
        and(
          eq(accountBalances.accountId, id),
          sql`${accountBalances.id} <> ${newest}`,
          sql`(${accountBalances.id} not in (${sql.join(keep.map((k) => sql`${k}`), sql`, `)}) or ${accountBalances.asOf} < ${now - SNAPSHOT_KEEP_MS})`,
        ),
      )
      .run();
  }
}

export function listSnapshots(accountId: string): AccountBalance[] {
  return db.select().from(accountBalances).where(eq(accountBalances.accountId, accountId)).orderBy(accountBalances.asOf).all();
}

// --- the per-account view (live) -----------------------------------------------------------------

export type AccountView = {
  account: MyAccount;
  balance: KnownBalance | null;
  stale: boolean;
  discrepancies: Discrepancy[];
};

type LedgerSource = LedgerRow & { accountId: string };

/** Pure: accounts + every snapshot + every ledger row ⇒ one view per account (input order kept). */
export function deriveAccountViews(
  accounts: readonly MyAccount[],
  snapshots: readonly Pick<AccountBalance, 'id' | 'accountId' | 'balanceMinor' | 'asOf' | 'acknowledgedAt'>[],
  ledger: readonly LedgerSource[],
  now: number,
): AccountView[] {
  const snapsBy = new Map<string, BalanceSnapshot[]>();
  for (const s of snapshots) {
    const list = snapsBy.get(s.accountId) ?? [];
    list.push(s);
    snapsBy.set(s.accountId, list);
  }
  const rowsBy = new Map<string, LedgerRow[]>();
  for (const r of ledger) {
    const list = rowsBy.get(r.accountId) ?? [];
    list.push(r);
    rowsBy.set(r.accountId, list);
  }
  return accounts.map((account) => {
    const snaps = snapsBy.get(account.id) ?? [];
    const rows = rowsBy.get(account.id) ?? [];
    const balance = currentBalance(snaps, rows);
    return {
      account,
      balance,
      stale: balance ? isStale(balance.asOf, now) : false,
      discrepancies: findDiscrepancies(snaps, rows),
    };
  });
}

function snapshotsQuery() {
  return db
    .select({
      id: accountBalances.id,
      accountId: accountBalances.accountId,
      balanceMinor: accountBalances.balanceMinor,
      asOf: accountBalances.asOf,
      acknowledgedAt: accountBalances.acknowledgedAt,
    })
    .from(accountBalances);
}

function ledgerTransactionsQuery() {
  return db
    .select({
      accountId: transactions.accountId,
      amountMinor: transactions.amountMinor,
      direction: transactions.direction,
      occurredAt: transactions.occurredAt,
    })
    .from(transactions)
    .where(and(isNull(transactions.deletedAt), isNotNull(transactions.accountId)));
}

function ledgerPendingQuery() {
  return db
    .select({
      accountId: suggestions.accountId,
      amountMinor: suggestions.amountMinor,
      direction: suggestions.direction,
      occurredAt: suggestions.occurredAt,
    })
    .from(suggestions)
    .where(
      and(
        eq(suggestions.status, 'pending'),
        isNotNull(suggestions.accountId),
        isNotNull(suggestions.amountMinor),
        isNotNull(suggestions.direction),
        isNotNull(suggestions.occurredAt),
      ),
    );
}

type RawLedger = { accountId: string | null; amountMinor: number | null; direction: 'debit' | 'credit' | null; occurredAt: number | null };

function toLedger(rows: readonly RawLedger[]): LedgerSource[] {
  return rows.flatMap((r) =>
    r.accountId && r.amountMinor !== null && r.direction && r.occurredAt !== null
      ? [{ accountId: r.accountId, amountMinor: r.amountMinor, direction: r.direction, occurredAt: r.occurredAt }]
      : [],
  );
}

/** Sync, for tests, the widget snapshot and headless use. */
export function listAccountViews(options: { includeArchived?: boolean; now?: number } = {}): AccountView[] {
  const accounts = db
    .select()
    .from(myAccounts)
    .where(options.includeArchived ? undefined : isNull(myAccounts.archivedAt))
    .all();
  const ledger = toLedger([...ledgerTransactionsQuery().all(), ...ledgerPendingQuery().all()]);
  return deriveAccountViews(accounts, snapshotsQuery().all(), ledger, options.now ?? Date.now());
}

/** Live views for every account (archived included — screens filter), in the given account order. */
export function useAccountViews(accounts: readonly MyAccount[]): AccountView[] {
  const [now] = useState(() => Date.now());
  const snaps = useLiveQuery(snapshotsQuery());
  const txns = useLiveQuery(ledgerTransactionsQuery());
  const pending = useLiveQuery(ledgerPendingQuery());
  return deriveAccountViews(accounts, snaps.data, toLedger([...txns.data, ...pending.data]), now);
}
