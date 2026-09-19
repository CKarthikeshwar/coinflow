/**
 * TEST-ONLY — small builders for rows the V2 repository tests need, written straight through Drizzle
 * onto the in-memory database from `memory-db.ts`.
 */

import { transactions, type NewTransaction, type Transaction } from '../schema';
import type { MemoryDb } from './memory-db';

let counter = 0;

export function insertTransaction(db: MemoryDb, overrides: Partial<NewTransaction> = {}): Transaction {
  counter += 1;
  const row: NewTransaction = {
    id: `txn-${counter}`,
    amountMinor: 120_000,
    direction: 'debit',
    type: 'expense',
    occurredAt: 1_790_000_000_000 + counter,
    source: 'manual',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
  db.insert(transactions).values(row).run();
  return db.select().from(transactions).all().find((t) => t.id === row.id) as Transaction;
}
