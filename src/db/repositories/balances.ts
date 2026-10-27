/**
 * FILE PURPOSE
 * ------------
 * The per-account view (SPEC-implementation.md §46, D50 / CR-41): an account's balance is the sum of its own
 * transactions from zero — credits `+`, debits `−`, the full `amountMinor` that moved through the bank, both legs of a
 * transfer, nothing else. No bank-reported figure is read or stored any more; `account_balance` stays in the schema,
 * unused. Pending Review Queue items are not transactions yet and are not counted.
 *
 * D51 (CR-42): the total also counts the transactions that belong to no account (`useUnassigned`).
 *
 * D48: balances never leave the device — not logged, not in crash reports.
 */

import { and, isNotNull, isNull, sql } from 'drizzle-orm';

import { accountBalance, type LedgerRow } from '@/domain/accounts/balance';
import { useLiveQuery } from '@/hooks/use-live-query';

import { db } from '../client';
import { myAccounts, transactions, type MyAccount } from '../schema';

export type AccountView = {
  account: MyAccount;
  /** Σ of the account's transactions from zero; ₹0 for an account with nothing recorded. */
  balanceMinor: number;
};

type LedgerSource = LedgerRow & { accountId: string };

/** Pure: accounts + every ledger row ⇒ one view per account (input order kept). */
export function deriveAccountViews(accounts: readonly MyAccount[], ledger: readonly LedgerSource[]): AccountView[] {
  const rowsBy = new Map<string, LedgerRow[]>();
  for (const r of ledger) {
    const list = rowsBy.get(r.accountId) ?? [];
    list.push(r);
    rowsBy.set(r.accountId, list);
  }
  return accounts.map((account) => ({ account, balanceMinor: accountBalance(rowsBy.get(account.id) ?? []) }));
}

function ledgerQuery() {
  return db
    .select({
      accountId: transactions.accountId,
      amountMinor: transactions.amountMinor,
      direction: transactions.direction,
    })
    .from(transactions)
    .where(and(isNull(transactions.deletedAt), isNotNull(transactions.accountId)));
}

type RawLedger = { accountId: string | null; amountMinor: number; direction: 'debit' | 'credit' };

function toLedger(rows: readonly RawLedger[]): LedgerSource[] {
  return rows.flatMap((r) => (r.accountId ? [{ accountId: r.accountId, amountMinor: r.amountMinor, direction: r.direction }] : []));
}

/** D51 (CR-42): the transactions that belong to no account — how many, and what they add up to (credits `+`, debits `−`). */
export type Unassigned = { balanceMinor: number; count: number };

function unassignedQuery() {
  return db
    .select({
      balanceMinor: sql<number>`COALESCE(SUM(CASE ${transactions.direction} WHEN 'credit' THEN ${transactions.amountMinor} ELSE -${transactions.amountMinor} END), 0)`,
      count: sql<number>`COUNT(*)`,
    })
    .from(transactions)
    .where(and(isNull(transactions.deletedAt), isNull(transactions.accountId)));
}

/** Sync, for tests, the widget snapshot and headless use. */
export function unassignedSummary(): Unassigned {
  const row = unassignedQuery().get();
  return { balanceMinor: row?.balanceMinor ?? 0, count: row?.count ?? 0 };
}

/** Live version of `unassignedSummary` — `updatedAt` is undefined until the first read lands. */
export function useUnassigned(): Unassigned & { updatedAt: Date | undefined } {
  const q = useLiveQuery(unassignedQuery());
  const row = q.data[0];
  return { balanceMinor: row?.balanceMinor ?? 0, count: row?.count ?? 0, updatedAt: q.updatedAt };
}

/** Sync, for tests, the widget snapshot and headless use. */
export function listAccountViews(options: { includeArchived?: boolean } = {}): AccountView[] {
  const accounts = db
    .select()
    .from(myAccounts)
    .where(options.includeArchived ? undefined : isNull(myAccounts.archivedAt))
    .all();
  return deriveAccountViews(accounts, toLedger(ledgerQuery().all()));
}

/** Live views for every account (archived included — screens filter), in the given account order. */
export function useAccountViews(accounts: readonly MyAccount[]): AccountView[] {
  const txns = useLiveQuery(ledgerQuery());
  return deriveAccountViews(accounts, toLedger(txns.data));
}
