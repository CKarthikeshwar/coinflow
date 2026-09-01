/**
 * Drizzle schema — the database blueprint. Mirrors SPEC-implementation.md §19 exactly.
 * Conventions (§19.0): money is an integer count of paise, always > 0; timestamps are
 * integer Unix epoch ms UTC; ids are UUIDv4 text; enums are text with a TS-only guard;
 * booleans are integer 0/1; raw SMS is never a column (only sender + receivedAt survive).
 *
 * SQL table names are singular snake_case (matching the raw SQL in §19.6 / §26); the
 * exported table objects are plural camelCase.
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
