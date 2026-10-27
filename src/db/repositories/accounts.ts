/**
 * FILE PURPOSE
 * ------------
 * The `accountRepo` — the user's own accounts (`my_account`, SPEC-implementation.md §46.2 / §46.7): a bank account,
 * a credit card, a wallet, cash in hand. Not to be confused with `account-rules.ts`, which remembers the *other party*
 * of a transaction (the shop / person — "Merchant rules" in the UI).
 *
 * WHERE IT FITS
 * -------------
 * Accounts are created two ways: by the user (My accounts › Add account) and automatically at SMS ingest
 * (`resolveAccountFromSms`, called from `services/tasks/sms-ingest.ts`) the first time a bank + last digits is seen.
 * Transactions point at an account through `transaction.accountId`; suggestions carry it from ingest to Confirm.
 *
 * IMPORTANT
 * ---------
 * - D48: only the last digits are stored — never a full account number, never the SMS text.
 * - `mergeAccounts` is the remedy for one real account detected twice (two SMS sender IDs, a 3- vs 4-digit mask): it
 *   moves every transaction, suggestion and balance to the kept account and deletes the other.
 * - Like every repository here, these run identically from the UI and the headless SMS task (synchronous driver).
 */

import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { randomUUID } from 'expo-crypto';

import { bankKeyFromName, defaultNickname, matchKey } from '@/domain/accounts/account-key';
import type { OwnAccountRef } from '@/domain/parser';
import { useLiveQuery } from '@/hooks/use-live-query';

import { db } from '../client';
import {
  accountBalances,
  myAccounts,
  suggestions,
  transactions,
  type AccountKind,
  type MyAccount,
  type PaymentMethod,
} from '../schema';

export type CreateAccountInput = {
  kind: AccountKind;
  nickname: string;
  bankName?: string | null;
  bankKey?: string | null;
  last4?: string | null;
  autoCreated?: boolean;
  creditLimitMinor?: number | null;
};

export type AccountPatch = Partial<Pick<MyAccount, 'kind' | 'nickname' | 'bankName' | 'last4' | 'creditLimitMinor'>>;

export class DuplicateAccountError extends Error {
  constructor(public readonly existingId: string) {
    super('An account with this bank and last digits already exists');
    this.name = 'DuplicateAccountError';
  }
}

/** Digits only, at most the last four (D48). Empty → null. */
export function cleanLast4(raw: string | null | undefined): string | null {
  const digits = (raw ?? '').replace(/\D/g, '');
  return digits ? digits.slice(-4) : null;
}

/** D46 — `bankKey:last4`, or null when either half is missing (and always for cash). */
function keyFor(kind: AccountKind, bankKey: string | null | undefined, last4: string | null): string | null {
  if (kind === 'cash' || !bankKey || !last4) return null;
  return matchKey(bankKey, last4);
}

function byMatchKey(key: string): MyAccount | null {
  return db.select().from(myAccounts).where(eq(myAccounts.matchKey, key)).get() ?? null;
}

export function createAccount(input: CreateAccountInput): MyAccount {
  const now = Date.now();
  const last4 = cleanLast4(input.last4);
  // a manually added account gets its key from the typed bank name, so later SMS land on it
  const bankKey = input.bankKey ?? bankKeyFromName(input.bankName);
  const key = keyFor(input.kind, bankKey, last4);
  if (key) {
    const existing = byMatchKey(key);
    if (existing) throw new DuplicateAccountError(existing.id);
  }
  const row: MyAccount = {
    id: randomUUID(),
    kind: input.kind,
    nickname: input.nickname.trim() || defaultNickname(bankKey, last4),
    bankName: input.bankName?.trim() || null,
    bankKey,
    last4,
    matchKey: key,
    autoCreated: input.autoCreated ?? false,
    archivedAt: null,
    creditLimitMinor: input.creditLimitMinor ?? null,
    dueAt: null,
    dueAmountMinor: null,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(myAccounts).values(row).run();
  return row;
}

/**
 * Edit. Opening an auto-created account in the sheet and saving it clears its **New** pill (`autoCreated`).
 * Changing the last digits re-keys it for SMS matching; a clash with another account throws `DuplicateAccountError`
 * (the sheet offers Merge instead).
 */
export function updateAccount(id: string, patch: AccountPatch): void {
  const current = getAccount(id);
  if (!current) return;
  const kind = patch.kind ?? current.kind;
  const last4 = patch.last4 !== undefined ? cleanLast4(patch.last4) : current.last4;
  const bankName = patch.bankName !== undefined ? patch.bankName?.trim() || null : current.bankName;
  // an SMS-given key is never replaced by a renamed bank; a manual account picks one up from its name
  const bankKey = current.bankKey ?? bankKeyFromName(bankName);
  const key = keyFor(kind, bankKey, last4);
  if (key && key !== current.matchKey) {
    const clash = byMatchKey(key);
    if (clash && clash.id !== id) throw new DuplicateAccountError(clash.id);
  }
  db.update(myAccounts)
    .set({
      kind,
      nickname: patch.nickname !== undefined ? patch.nickname.trim() || current.nickname : current.nickname,
      bankName,
      bankKey,
      last4,
      matchKey: key,
      creditLimitMinor: patch.creditLimitMinor !== undefined ? patch.creditLimitMinor : current.creditLimitMinor,
      autoCreated: false,
      updatedAt: Date.now(),
    })
    .where(eq(myAccounts.id, id))
    .run();
}

/** UI-104 — the user has seen the auto-created account (opened it from the Review card): drop the New pill. */
export function markAccountSeen(id: string): void {
  db.update(myAccounts).set({ autoCreated: false, updatedAt: Date.now() }).where(eq(myAccounts.id, id)).run();
}

export function archiveAccount(id: string): void {
  const now = Date.now();
  db.update(myAccounts).set({ archivedAt: now, autoCreated: false, updatedAt: now }).where(eq(myAccounts.id, id)).run();
}

export function unarchiveAccount(id: string): void {
  db.update(myAccounts).set({ archivedAt: null, updatedAt: Date.now() }).where(eq(myAccounts.id, id)).run();
}

/**
 * §46.7 — "this is the same account": everything on `fromId` moves to `intoId`, `fromId` is deleted, `intoId` keeps
 * its nickname. A transfer pair that ends up with both sides on the one account is no longer a transfer — both rows
 * go back to an expense / income (§46.6 Unlink). The kept account takes over `fromId`'s last digits when it had none.
 */
export function mergeAccounts(fromId: string, intoId: string): void {
  if (fromId === intoId) return;
  const from = getAccount(fromId);
  const into = getAccount(intoId);
  if (!from || !into) return;
  const now = Date.now();
  db.transaction((tx) => {
    tx.update(transactions).set({ accountId: intoId, updatedAt: now }).where(eq(transactions.accountId, fromId)).run();
    tx.update(suggestions).set({ accountId: intoId }).where(eq(suggestions.accountId, fromId)).run();
    tx.update(accountBalances).set({ accountId: intoId }).where(eq(accountBalances.accountId, fromId)).run();

    // pairs now inside one account: unlink both sides
    const inside = tx
      .select({ id: transactions.id, direction: transactions.direction, peer: transactions.transferPeerId })
      .from(transactions)
      .where(and(eq(transactions.accountId, intoId), isNotNull(transactions.transferPeerId)))
      .all();
    const ids = new Set(inside.map((r) => r.id));
    for (const r of inside) {
      if (!r.peer || !ids.has(r.peer)) continue;
      tx.update(transactions)
        .set({ type: r.direction === 'credit' ? 'income' : 'expense', transferPeerId: null, categoryId: null, updatedAt: now })
        .where(eq(transactions.id, r.id))
        .run();
    }

    tx.delete(myAccounts).where(eq(myAccounts.id, fromId)).run();
    if (!into.last4 && from.last4) {
      tx.update(myAccounts).set({ last4: from.last4, updatedAt: now }).where(eq(myAccounts.id, intoId)).run();
    }
    tx.update(myAccounts).set({ autoCreated: false, updatedAt: now }).where(eq(myAccounts.id, intoId)).run();
  });
}

/**
 * D51 (CR-42) — every non-deleted transaction that belongs to no account moves onto `accountId`, in one step. Only the
 * account changes (amount, date, category, split, note stay). Returns how many moved; an unknown or archived target
 * writes nothing and returns 0.
 */
export function moveUnassignedTo(accountId: string): number {
  const target = getAccount(accountId);
  if (!target || target.archivedAt) return 0;
  return db
    .update(transactions)
    .set({ accountId, updatedAt: Date.now() })
    .where(and(isNull(transactions.accountId), isNull(transactions.deletedAt)))
    .run().changes;
}

/**
 * §46.5 — the account an SMS is about: found by `bankKey:last4`, or created (`autoCreated`, nickname "HDFC ··672",
 * kind from the message). Returns the id. An archived match is still used (the history stays on it) but not revived.
 */
export function resolveAccountFromSms(own: OwnAccountRef): { id: string; created: boolean } {
  const key = matchKey(own.bankKey, own.last4);
  const existing = byMatchKey(key);
  if (existing) return { id: existing.id, created: false };
  try {
    const row = createAccount({
      kind: own.kind,
      nickname: defaultNickname(own.bankKey, own.last4),
      bankName: own.bankName,
      bankKey: own.bankKey,
      last4: own.last4,
      autoCreated: true,
    });
    return { id: row.id, created: true };
  } catch (e) {
    // a concurrent ingest created it between the lookup and the insert
    const raced = byMatchKey(key);
    if (raced) return { id: raced.id, created: false };
    throw e;
  }
}

export function getAccount(id: string): MyAccount | null {
  return db.select().from(myAccounts).where(eq(myAccounts.id, id)).get() ?? null;
}

const SECTION_ORDER = sql`case ${myAccounts.kind} when 'bank' then 0 when 'credit_card' then 1 when 'wallet' then 2 else 3 end`;

export function listAccounts(options: { includeArchived?: boolean } = {}): MyAccount[] {
  return db
    .select()
    .from(myAccounts)
    .where(options.includeArchived ? undefined : isNull(myAccounts.archivedAt))
    .orderBy(SECTION_ORDER, asc(myAccounts.createdAt))
    .all();
}

/** Live: every account (archived too — screens filter), section order then age. */
export function useAccounts() {
  return useLiveQuery(db.select().from(myAccounts).orderBy(SECTION_ORDER, asc(myAccounts.createdAt)));
}

export function useAccount(id: string | null | undefined) {
  return useLiveQuery(db.select().from(myAccounts).where(eq(myAccounts.id, id ?? '')), [id]);
}

/** UI-104 — auto-created accounts the user has not looked at yet (Review Queue cards). */
export function useNewAccounts() {
  return useLiveQuery(
    db
      .select()
      .from(myAccounts)
      .where(and(eq(myAccounts.autoCreated, true), isNull(myAccounts.archivedAt)))
      .orderBy(desc(myAccounts.createdAt)),
  );
}

/** UI-102 — the account most recently used with `method` (for **Paid from** preselection). */
export function lastUsedAccountForMethod(method: PaymentMethod | null): string | null {
  if (!method) return null;
  const row = db
    .select({ accountId: transactions.accountId })
    .from(transactions)
    .where(and(eq(transactions.paymentMethod, method), isNotNull(transactions.accountId), isNull(transactions.deletedAt)))
    .orderBy(desc(transactions.occurredAt))
    .limit(1)
    .get();
  return row?.accountId ?? null;
}

/** Last digits of the user's (non-archived) credit cards — for the card-bill hint at ingest. */
export function listCardLast4s(): { id: string; last4: string }[] {
  return db
    .select({ id: myAccounts.id, last4: myAccounts.last4 })
    .from(myAccounts)
    .where(and(eq(myAccounts.kind, 'credit_card'), isNull(myAccounts.archivedAt), isNotNull(myAccounts.last4)))
    .all()
    .map((r) => ({ id: r.id, last4: r.last4 as string }));
}

/** id → account, for list rows / labels. */
export function accountsById(ids: readonly string[]): Map<string, MyAccount> {
  if (ids.length === 0) return new Map();
  const rows = db.select().from(myAccounts).where(inArray(myAccounts.id, [...ids])).all();
  return new Map(rows.map((r) => [r.id, r]));
}

/** How many transactions point at an account (the merge confirm says what moves). */
export function countAccountTransactions(id: string): number {
  const row = db
    .select({ n: sql<number>`count(*)` })
    .from(transactions)
    .where(and(eq(transactions.accountId, id), isNull(transactions.deletedAt)))
    .get();
  return row?.n ?? 0;
}

/**
 * §46.5 — a card statement's due date and amount. Only a statement for the same or a later due date replaces what is
 * stored, so an old statement re-read by the reconcile sweep never rolls the bill back. Returns whether it changed.
 */
export function updateCardDue(accountId: string, due: { amountMinor: number; dueAt: number }): boolean {
  const current = getAccount(accountId);
  if (!current) return false;
  if (current.dueAt !== null && due.dueAt < current.dueAt) return false;
  if (current.dueAt === due.dueAt && current.dueAmountMinor === due.amountMinor) return false;
  db.update(myAccounts)
    .set({ dueAt: due.dueAt, dueAmountMinor: due.amountMinor, updatedAt: Date.now() })
    .where(eq(myAccounts.id, accountId))
    .run();
  return true;
}
