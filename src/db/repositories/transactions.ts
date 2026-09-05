/**
 * FILE PURPOSE
 * ------------
 * The `transactionRepo` — every operation the app performs on the `transactions` table lives
 * here: create, edit, soft-delete, restore, permanently purge, look up one, look up a live
 * list with filters/search, and check for a duplicate. This is the ONLY file in the app that
 * writes SQL against the `transactions` table — no screen or component queries it directly.
 *
 * WHERE IT FITS
 * -------------
 * Sits directly on top of `src/db/schema.ts` (the table definition) and `src/db/client.ts`
 * (the shared connection). Screens and features call these functions instead of writing their
 * own SQL — that's what "repository layer" means here: one trusted place per table, so every
 * caller gets the exact same derived-field logic (see below) instead of each screen
 * reimplementing it slightly differently.
 *
 * USED BY
 * -------
 * `src/features/transactions/write-confirmed-transaction.ts` (Add/Confirm), `src/app/transaction/[id].tsx`
 * (Details/Edit/Delete), `src/app/(tabs)/transactions.tsx` (the ledger list + search),
 * `src/features/transactions/undo-host.tsx` (Undo), `src/services/notifications/respond.ts`
 * (the headless "Save from notification" path), and several Analytics/Home queries.
 *
 * DATA FLOW
 * ---------
 * A write always goes through `insertTransaction`/`updateTransaction`, which derive a few
 * fields automatically rather than trusting the caller to supply them correctly (see
 * IMPORTANT below), then a live-query hook (`useTransactionList`, `useTransaction`,
 * `useRecentTransactions`) automatically re-renders any screen reading that data — because
 * `src/db/client.ts` has `enableChangeListener` on, ANY write from ANYWHERE (including the
 * background SMS task) makes every open live query refresh, not just the screen that wrote it.
 *
 * IMPORTANT
 * ---------
 * - Every write path here (`insertTransaction`, `updateTransaction`, etc.) is called
 *   identically from the UI and from the headless background task that runs when the user taps
 *   "Save" on a notification without opening the app — this only works because `expo-sqlite`'s
 *   synchronous driver means there's no separate async/sync version to keep in sync.
 * - On every insert/update, three fields are derived automatically rather than trusted from
 *   the caller: `type` is derived from `direction` (debit → expense, credit → income, unless the
 *   caller explicitly passes a reserved type), `normalizedAccountKey` is computed from `account`
 *   via `src/domain/normalize.ts` (this is the key `accountRules` matching relies on), and
 *   `searchText` is a lower-cased combination of note/description/account for the search
 *   fallback when FTS5 isn't available (`src/db/fts.ts`).
 * - `categoryId` is always forced to `null` when `type` is `'income'` — income transactions are
 *   never categorized in this app (a deliberate product decision, not a bug).
 */

import { and, desc, eq, inArray, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';
import { randomUUID } from 'expo-crypto';

import { normalizeAccount } from '@/domain/normalize';
import { startOfLocalDay } from '@/domain/period';
import { useLiveQuery } from '@/hooks/use-live-query';

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
  /** F7 — `categoryId IS NULL`, scoped to `type='expense'` (income is also uncategorized by
   * construction, IMP-011, but isn't what "Uncategorized" means here — §26.8). ORed with
   * `categoryIds` when both are set. Not a `category.id` (§25.3), so it's its own flag. */
  uncategorized?: boolean;
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

export function getTransaction(id: string): Transaction | null {
  return db.select().from(transactions).where(eq(transactions.id, id)).get() ?? null;
}

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
  const { search, categoryIds, uncategorized, type, methods, from, to, limit = 200 } = query;
  const conds = [isNull(transactions.deletedAt)];
  if (type) conds.push(eq(transactions.type, type));
  if (from != null) conds.push(sql`${transactions.occurredAt} >= ${from}`);
  if (to != null) conds.push(sql`${transactions.occurredAt} <= ${to}`);

  // The category filter chip row lets the user select specific categories AND a special
  // "Uncategorized" chip at the same time — this builds the matching SQL condition for
  // whichever combination is active. "Uncategorized" isn't a real category row; it means
  // "expense transactions with no categoryId" (income is always categoryId=null too, by the
  // rule above, but that doesn't count as "Uncategorized" for filtering purposes here).
  const categoryCond =
    categoryIds?.length && uncategorized
      ? or(inArray(transactions.categoryId, categoryIds), and(isNull(transactions.categoryId), eq(transactions.type, 'expense')))
      : categoryIds?.length
        ? inArray(transactions.categoryId, categoryIds)
        : uncategorized
          ? and(isNull(transactions.categoryId), eq(transactions.type, 'expense'))
          : undefined;
  if (categoryCond) conds.push(categoryCond);

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
    const day = startOfLocalDay(row.occurredAt);
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
