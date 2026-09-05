/**
 * FILE PURPOSE
 * ------------
 * This is the database blueprint — every table CoinFlow has, and every column on each table.
 * It's written using Drizzle ORM's schema syntax, which both (a) generates the actual SQLite
 * table-creation SQL, and (b) gives every other file in the app fully-typed access to rows
 * (e.g. `Transaction` below is a TypeScript type generated straight from this table definition,
 * so if you add/rename a column here, TypeScript will flag every place in the app that needs
 * updating).
 *
 * WHERE IT FITS
 * -------------
 * This is the lowest layer of the whole app — nothing in `src/db/`, `src/domain/`, or
 * `src/features/` can exist without it. No screen or component ever imports this file directly
 * to run a query, though: all reads/writes go through `src/db/repositories/*.ts` ("the only
 * sanctioned way the app touches the database" — see that folder). This file only defines the
 * shape of the data; the repositories define the operations on it.
 *
 * THE FIVE TABLES, IN PLAIN LANGUAGE
 * -----------------------------------
 * - `categories`   — the list of spending categories (Food, Travel, ...), plus any custom ones
 *                    the user creates. `kind` distinguishes seeded ("default"), the single
 *                    built-in "Uncategorized" ("system", `isProtected: true` so it can't be
 *                    deleted), and user-created ("custom").
 * - `transactions`  — the actual ledger: every confirmed expense/income. Each row optionally
 *                    links to a `categories` row (`categoryId`). `source` says whether it was
 *                    typed manually or came from an SMS. `deletedAt` is a *soft* delete (the row
 *                    stays for a few seconds so the "Undo" snackbar can restore it — see D26 in
 *                    the codebase's own change history) rather than deleting immediately.
 * - `accountRules`  — the app's "memory" of what you usually do for a given bank
 *                    account/merchant: which category, note, and payment method you picked last
 *                    time. This is what makes SMS-detected transactions get a category
 *                    auto-filled the second time you see the same account. See
 *                    `src/domain/categorize.ts` and `src/db/repositories/account-rules.ts`.
 * - `suggestions`   — a transaction the app *thinks* it detected from an SMS, but the user
 *                    hasn't confirmed yet. Lives in the Review Queue / a notification until the
 *                    user confirms it (at which point a real `transactions` row is created and
 *                    `confirmedTransactionId` links back to it) or dismisses it (hard-deleted).
 * - `appSettings`   — a generic key/value table for small app-wide settings (e.g. which
 *                    analytics period mode was last selected) that don't deserve their own table.
 *
 * IMPORTANT CONVENTIONS (apply throughout the app, not just this file)
 * ----------------------------------------------------------------------
 * - Money is always an integer count of **paise** (never a fractional rupee number) — see
 *   `src/domain/format/money.ts` for why.
 * - Timestamps are integer Unix epoch milliseconds (UTC) — see `src/domain/period.ts` for how
 *   these get converted to "local calendar day" for display/bucketing.
 * - IDs are randomly generated UUIDv4 strings, not auto-incrementing integers.
 * - The raw text of an SMS is *never* stored anywhere in the database — only `smsSender` and
 *   `smsReceivedAt` survive from the original message, once it's been parsed. This is a
 *   deliberate privacy decision, not an oversight.
 * - SQL table names are singular ("transaction", "category"); the exported JS/TS objects you'll
 *   actually import (`transactions`, `categories`) are plural, matching normal JS naming.
 */

import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

const nowMs = () => Date.now();

const PAYMENT_METHODS = ['upi', 'card', 'cash', 'bank_transfer', 'wallet'] as const;

export const categories = sqliteTable('category', {
  id: text('id').primaryKey(),
  key: text('key').unique(), // stable slug for seeded rows; null for custom
  name: text('name').notNull(),
  icon: text('icon').notNull(), // Lucide glyph name (§3.4)
  kind: text('kind', { enum: ['system', 'default', 'custom'] }).notNull(),
  isProtected: integer('isProtected', { mode: 'boolean' }).notNull().default(false),
  order: integer('order').notNull(),
  createdAt: integer('createdAt').notNull().$defaultFn(nowMs),
  updatedAt: integer('updatedAt').notNull().$defaultFn(nowMs),
});

export const transactions = sqliteTable(
  'transaction',
  {
    id: text('id').primaryKey(),
    amountMinor: integer('amountMinor').notNull(), // paise, > 0
    direction: text('direction', { enum: ['debit', 'credit'] }).notNull(),
    // `transfer` / `refund` / `reimbursement` are reserved (not user-selectable in V1);
    // storing them in the guard now means they land later with no migration (IMP-012).
    type: text('type', {
      enum: ['expense', 'income', 'transfer', 'refund', 'reimbursement'],
    }).notNull(),
    categoryId: text('categoryId').references(() => categories.id, { onDelete: 'set null' }),
    paymentMethod: text('paymentMethod', { enum: PAYMENT_METHODS }),
    account: text('account'),
    normalizedAccountKey: text('normalizedAccountKey'),
    note: text('note'),
    description: text('description'),
    // D27 search fallback: lower(note + description + account), refreshed on every write.
    // Also queried directly when a device's SQLite lacks FTS5 (§19.6).
    searchText: text('searchText'),
    occurredAt: integer('occurredAt').notNull(),
    createdAt: integer('createdAt').notNull().$defaultFn(nowMs),
    updatedAt: integer('updatedAt').notNull().$defaultFn(nowMs),
    deletedAt: integer('deletedAt'), // soft-delete for Undo (D26)
    source: text('source', { enum: ['manual', 'sms'] }).notNull(),
    smsSender: text('smsSender'),
    smsReceivedAt: integer('smsReceivedAt'),
    dedupeKey: text('dedupeKey'), // copied from the originating suggestion (§17.3)
    editedByUser: integer('editedByUser', { mode: 'boolean' }).notNull().default(false),
  },
  (t) => [
    index('idx_txn_occurred').on(t.deletedAt, t.occurredAt),
    index('idx_txn_type_occurred').on(t.deletedAt, t.type, t.occurredAt),
    index('idx_txn_category').on(t.deletedAt, t.categoryId, t.occurredAt),
    index('idx_txn_dedupe').on(t.dedupeKey),
    index('idx_txn_normkey').on(t.normalizedAccountKey),
  ],
);

export const accountRules = sqliteTable(
  'account_rule',
  {
    normalizedKey: text('normalizedKey').primaryKey(), // the §24 normalized account string
    displayAccount: text('displayAccount').notNull(),
    lastNote: text('lastNote'), // explicit NULL when the user cleared the note (P-6)
    categoryId: text('categoryId').references(() => categories.id, { onDelete: 'set null' }),
    lastPaymentMethod: text('lastPaymentMethod', { enum: PAYMENT_METHODS }),
    hitCount: integer('hitCount').notNull().default(0),
    createdAt: integer('createdAt').notNull().$defaultFn(nowMs),
    updatedAt: integer('updatedAt').notNull().$defaultFn(nowMs),
  },
  (t) => [index('idx_rule_prefix').on(t.displayAccount)],
);

export const suggestions = sqliteTable(
  'suggestion',
  {
    id: text('id').primaryKey(),
    amountMinor: integer('amountMinor'), // may be a partial parse
    direction: text('direction', { enum: ['debit', 'credit'] }),
    occurredAt: integer('occurredAt'),
    account: text('account'),
    normalizedKey: text('normalizedKey'),
    paymentMethod: text('paymentMethod', { enum: PAYMENT_METHODS }),
    smsSender: text('smsSender').notNull(),
    smsReceivedAt: integer('smsReceivedAt').notNull(),
    dedupeKey: text('dedupeKey').notNull(),
    // dismiss is a hard DELETE (D26); `confirmed` is kept briefly for stale-tap routing.
    status: text('status', { enum: ['pending', 'confirmed'] })
      .notNull()
      .default('pending'),
    confirmedTransactionId: text('confirmedTransactionId').references(() => transactions.id, {
      onDelete: 'set null',
    }),
    createdAt: integer('createdAt').notNull().$defaultFn(nowMs),
  },
  (t) => [
    index('idx_sugg_status').on(t.status, t.createdAt),
    uniqueIndex('uniq_sugg_dedupe').on(t.dedupeKey),
  ],
);

export const appSettings = sqliteTable('app_setting', {
  key: text('key').primaryKey(),
  value: text('value').notNull(), // JSON-encoded scalar / small object
  updatedAt: integer('updatedAt').notNull().$defaultFn(nowMs),
});

export const schema = { categories, transactions, accountRules, suggestions, appSettings };

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type AccountRule = typeof accountRules.$inferSelect;
export type NewAccountRule = typeof accountRules.$inferInsert;
export type Suggestion = typeof suggestions.$inferSelect;
export type NewSuggestion = typeof suggestions.$inferInsert;
export type AppSetting = typeof appSettings.$inferSelect;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export type TransactionType = Transaction['type'];
export type Direction = 'debit' | 'credit';
