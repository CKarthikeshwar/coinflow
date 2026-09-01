/**
 * FTS5 availability probe (D27 / SPEC-implementation.md §19.6). SDK 57 ships SQLite with
 * FTS5 on by default, so this normally returns true. If a device's build lacks it, the
 * Transactions search repo falls back to `transaction.searchText LIKE ?`.
 */

import { sqlite } from './client';

let cached: boolean | null = null;

export function isFtsAvailable(): boolean {
  if (cached !== null) return cached;
  try {
    sqlite.getFirstSync('SELECT 1 FROM transaction_fts LIMIT 1');
    cached = true;
  } catch {
    cached = false;
  }
  return cached;
}
