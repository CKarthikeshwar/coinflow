/**
 * FILE PURPOSE
 * ------------
 * Checks (once, then caches the answer) whether this device's build of SQLite has the FTS5
 * full-text-search extension available, so the Transactions search feature knows which search
 * strategy it's allowed to use.
 *
 * WHERE IT FITS
 * -------------
 * Read by `src/db/repositories/transactions.ts` (`useTransactionList`) every time the user
 * types a search query. If FTS5 is available, search uses SQLite's `MATCH` for fast,
 * word-based search. If not, it falls back to a plain `searchText LIKE '%term%'` scan — slower
 * and less flexible (no partial-word matching), but works everywhere.
 *
 * IMPORTANT
 * ---------
 * This app's target SDK ships SQLite with FTS5 compiled in by default, so in practice this
 * almost always returns `true` — the `LIKE` fallback exists as a safety net for whatever device
 * variance might exist, not because FTS5 is expected to be commonly missing. The check itself
 * works by literally trying an FTS5 query and seeing if it throws, since there's no direct
 * "does this SQLite build support X" API to call instead.
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
