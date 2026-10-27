/**
 * §46.3 `balance.ts` (D50, CR-41) — an account's balance is the sum of its own transactions, from zero: credits `+`,
 * debits `−`, the full amount that moved through the bank. There is no opening balance and no bank-reported anchor, so
 * the figure is never "unknown" — an account with nothing recorded is ₹0. Pure — no database / React Native.
 */

import type { AccountKind, Direction } from '@/db/schema';

export type LedgerRow = { amountMinor: number; direction: Direction };

/** credit `+`, debit `−` — the same for a card (a spend makes the balance more negative = more owed; a payment raises it). */
export function signed(row: LedgerRow): number {
  return row.direction === 'credit' ? row.amountMinor : -row.amountMinor;
}

/** Σ signed rows. The caller passes every non-deleted transaction of the account (both legs of a transfer included). */
export function accountBalance(rows: readonly LedgerRow[]): number {
  return rows.reduce((sum, r) => sum + signed(r), 0);
}

export type AccountForTotal = {
  kind: AccountKind;
  archived: boolean;
  balanceMinor: number;
};

export type TotalBalance = {
  /** every transaction that is not on a card: bank + wallet + cash accounts, archived ones too, plus rows with no account (D51) */
  totalMinor: number;
  /** how many live (non-archived) accounts are in the total — the "across N accounts" caption */
  accountCount: number;
  /** the part of the total that sits on no account */
  unassignedMinor: number;
};

/**
 * D51 (CR-42): the complete total. `unassignedMinor` is the signed sum of the transactions that belong to no account;
 * they are the user's money too, so they count. Cards are not your money (D49). Archived accounts count — hiding an
 * account does not make its transactions go away.
 */
/** The line under the total on Home / My accounts. `unassignedCount` = transactions that belong to no account. */
export function totalCaption(accountCount: number, unassignedCount: number): string {
  if (accountCount === 0) return 'not on any account';
  const base = `across ${accountCount} account${accountCount === 1 ? '' : 's'}`;
  return unassignedCount > 0 ? `${base} + unassigned` : base;
}

export function totalBalance(accounts: readonly AccountForTotal[], unassignedMinor = 0): TotalBalance {
  let totalMinor = unassignedMinor;
  let accountCount = 0;
  for (const a of accounts) {
    if (a.kind === 'credit_card') continue;
    if (!a.archived) accountCount += 1;
    totalMinor += a.balanceMinor;
  }
  return { totalMinor, accountCount, unassignedMinor };
}
