/**
 * transactionRepo — SPEC-implementation.md §21.1 / §19.1. Every write path here is shared
 * verbatim between the UI and the headless notification Save (§17.0 rule 2) — the repo is
 * synchronous because the `expo-sqlite` driver is (§20.1).
 *
 * Derived on write: `type` from `direction` (debit→expense, credit→income; caller may pass
 * a reserved type explicitly — IMP-012), `normalizedAccountKey` from `account` (§24),
 * `searchText` for the D27 search fallback. `categoryId` is forced null when `type` is
 * income (IMP-011).
 */

import { and, desc, eq, inArray, isNotNull, isNull, lt, sql } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { randomUUID } from 'expo-crypto';

import { normalizeAccount } from '@/domain/normalize';

import { db } from '../client';
import { isFtsAvailable } from '../fts';
import {
  suggestions,
  transactions,
  type Direction,
  type PaymentMethod,
  type Transaction,
  type TransactionType,
} from '../schema';

export type InsertTransactionInput = {
  amountMinor: number;
  direction: Direction;
  type?: TransactionType;
  categoryId?: string | null;
  paymentMethod?: PaymentMethod | null;
  account?: string | null;
  note?: string | null;
  description?: string | null;
  occurredAt: number;
  source: 'manual' | 'sms';
  smsSender?: string | null;
  smsReceivedAt?: number | null;
  dedupeKey?: string | null;
};

export type TransactionListQuery = {
  search?: string;
  categoryIds?: string[];
  type?: TransactionType;
  methods?: PaymentMethod[];
  from?: number;
  to?: number;
  limit?: number;
};

function typeFromDirection(direction: Direction): TransactionType {
  return direction === 'credit' ? 'income' : 'expense';
}

function searchTextOf(note?: string | null, description?: string | null, account?: string | null): string {
  return `${note ?? ''} ${description ?? ''} ${account ?? ''}`.toLowerCase().replace(/\s+/g, ' ').trim();
}

function localDayStart(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0); // device-zone midnight; §27.3 period helper formalises this in step 5
  return d.getTime();
}

export function insertTransaction(input: InsertTransactionInput): Transaction {
  const now = Date.now();
  const type = input.type ?? typeFromDirection(input.direction);
  const account = input.account?.trim() || null;
  const note = input.note?.trim() || null;
  const description = input.description?.trim() || null;
  const row: Transaction = {
    id: randomUUID(),
    amountMinor: input.amountMinor,
    direction: input.direction,
    type,
    categoryId: type === 'income' ? null : (input.categoryId ?? null),
    paymentMethod: input.paymentMethod ?? null,
    account,
    normalizedAccountKey: account ? normalizeAccount(account) : null,
    note,
    description,
    searchText: searchTextOf(note, description, account),
    occurredAt: input.occurredAt,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    source: input.source,
    smsSender: input.smsSender ?? null,
    smsReceivedAt: input.smsReceivedAt ?? null,
    dedupeKey: input.dedupeKey ?? null,
    editedByUser: false,
  };
  db.insert(transactions).values(row).run();
  return row;
}

export const insertTransactionSync = insertTransaction;

export type TransactionPatch = Partial<
  Pick<
    InsertTransactionInput,
    'amountMinor' | 'direction' | 'type' | 'categoryId' | 'paymentMethod' | 'account' | 'note' | 'description' | 'occurredAt'
  >
>;

export function updateTransaction(id: string, patch: TransactionPatch): void {
  const current = db.select().from(transactions).where(eq(transactions.id, id)).get();
  if (!current) return;

  const direction = patch.direction ?? current.direction;
  const type = patch.type ?? (patch.direction ? typeFromDirection(patch.direction) : current.type);
  const account = patch.account !== undefined ? patch.account?.trim() || null : current.account;
  const note = patch.note !== undefined ? patch.note?.trim() || null : current.note;
  const description =
    patch.description !== undefined ? patch.description?.trim() || null : current.description;

  db.update(transactions)
    .set({
      amountMinor: patch.amountMinor ?? current.amountMinor,
      direction,
      type,
      categoryId:
        type === 'income'
          ? null
          : patch.categoryId !== undefined
            ? patch.categoryId
            : current.categoryId,
      paymentMethod: patch.paymentMethod !== undefined ? patch.paymentMethod : current.paymentMethod,
      account,
      normalizedAccountKey: account ? normalizeAccount(account) : null,
      note,
      description,
      searchText: searchTextOf(note, description, account),
      occurredAt: patch.occurredAt ?? current.occurredAt,
      editedByUser: true,
      updatedAt: Date.now(),
    })
    .where(eq(transactions.id, id))
    .run();
}

export function softDeleteTransaction(id: string): void {
  const now = Date.now();
  db.update(transactions).set({ deletedAt: now, updatedAt: now }).where(eq(transactions.id, id)).run();
}

export function restoreTransaction(id: string): void {
  db.update(transactions).set({ deletedAt: null, updatedAt: Date.now() }).where(eq(transactions.id, id)).run();
}

export function purgeDeleted(before: number): void {
  db.delete(transactions)
    .where(and(isNotNull(transactions.deletedAt), lt(transactions.deletedAt, before)))
    .run();
}

export const purgeDeletedSync = purgeDeleted;

export function getTransaction(id: string): Transaction | null {
  return db.select().from(transactions).where(eq(transactions.id, id)).get() ?? null;
}

export const getTransactionSync = getTransaction;

export function useTransaction(id: string) {
  return useLiveQuery(db.select().from(transactions).where(eq(transactions.id, id)), [id]);
}

export function useRecentTransactions(limit = 8) {
  return useLiveQuery(
    db
      .select()
      .from(transactions)
      .where(isNull(transactions.deletedAt))
      .orderBy(desc(transactions.occurredAt))
      .limit(limit),
  );
}

export type DaySubtotal = { dayStartMs: number; spentMinor: number };

/**
 * The Transactions ledger query (§6.7). Search uses FTS5 when available, else the
 * `searchText LIKE` fallback (D27). `daySubtotals` is spend-only, bucketed by device-zone
 * day (the §27.3 helper refines the boundary in step 5).
 */
export function useTransactionList(query: TransactionListQuery) {
  const { search, categoryIds, type, methods, from, to, limit = 200 } = query;
  const conds = [isNull(transactions.deletedAt)];
  if (type) conds.push(eq(transactions.type, type));
  if (from != null) conds.push(sql`${transactions.occurredAt} >= ${from}`);
  if (to != null) conds.push(sql`${transactions.occurredAt} <= ${to}`);
  if (categoryIds?.length) conds.push(inArray(transactions.categoryId, categoryIds));
  if (methods?.length) conds.push(inArray(transactions.paymentMethod, methods));

  if (search?.trim()) {
    const term = search.trim().toLowerCase();
    if (isFtsAvailable()) {
      const match = term
        .split(/\s+/)
        .map((t) => `${t.replace(/["*]/g, '')}*`)
        .join(' ');
      conds.push(
        sql`rowid in (SELECT rowid FROM transaction_fts WHERE transaction_fts MATCH ${match})`,
      );
    } else {
      conds.push(sql`${transactions.searchText} like ${`%${term}%`}`);
    }
  }

  const q = useLiveQuery(
    db
      .select()
      .from(transactions)
      .where(and(...conds))
      .orderBy(desc(transactions.occurredAt))
      .limit(limit),
    [JSON.stringify(query)],
  );

  const byDay = new Map<number, number>();
  for (const row of q.data) {
    if (row.type !== 'expense') continue;
    const day = localDayStart(row.occurredAt);
    byDay.set(day, (byDay.get(day) ?? 0) + row.amountMinor);
  }
  const daySubtotals: DaySubtotal[] = [...byDay.entries()]
    .map(([dayStartMs, spentMinor]) => ({ dayStartMs, spentMinor }))
    .sort((a, b) => b.dayStartMs - a.dayStartMs);

  return { ...q, rows: q.data, daySubtotals };
}

/** §17.3 step-4 idempotency guard — checks `transaction` AND `suggestion`. */
export function hasDedupeKey(key: string): boolean {
  const inTxn = db.select({ id: transactions.id }).from(transactions).where(eq(transactions.dedupeKey, key)).get();
  if (inTxn) return true;
  const inSugg = db.select({ id: suggestions.id }).from(suggestions).where(eq(suggestions.dedupeKey, key)).get();
  return !!inSugg;
}

export const hasDedupeKeySync = hasDedupeKey;
