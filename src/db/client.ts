/**
 * FILE PURPOSE
 * ------------
 * Opens the single SQLite database connection the whole app shares, and exports the Drizzle
 * `db` object every repository in `src/db/repositories/` uses to run queries.
 *
 * WHERE IT FITS
 * -------------
 * This is imported by every file in `src/db/repositories/` (and by `src/db/maintenance.ts`,
 * `src/db/seed.ts`, `src/db/fts.ts`). Nothing else in the app should import this directly —
 * screens and features go through a repository, never straight to `db`.
 *
 * IMPORTANT
 * ---------
 * - `openDatabaseSync` (the synchronous API) is used deliberately, not the async variant. This
 *   app also runs database code from a *headless* background task (when an SMS arrives while
 *   the app isn't open — see `src/services/tasks/sms-ingest.ts`), and using the same synchronous
 *   API in both the UI and the headless task means both code paths behave identically — there's
 *   no separate "async" version of the repository functions to keep in sync.
 * - `enableChangeListener: true` is what makes `src/hooks/use-live-query.ts` work — it lets a
 *   screen's query automatically re-run and re-render whenever *any* write happens anywhere in
 *   the app (including from the background task), without the screen having to manually refetch.
 * - `PRAGMA journal_mode = WAL` allows a screen that's reading the database at the same moment
 *   a background write happens (e.g. a new SMS is being saved) to keep working without
 *   blocking. `PRAGMA foreign_keys = ON` makes SQLite actually enforce the `ON DELETE SET NULL`
 *   relationships declared in `schema.ts` (e.g. deleting a category clears `categoryId` on any
 *   transaction that used it, instead of leaving a dangling reference).
 * - This file has a `.web.ts` sibling (`client.web.ts`) that intentionally throws if anything
 *   tries to use it — the database only exists on Android.
 */

import { drizzle } from 'drizzle-orm/expo-sqlite';
import * as SQLite from 'expo-sqlite';

import { schema } from './schema';

export const sqlite = SQLite.openDatabaseSync('coinflow.db', { enableChangeListener: true });

// WAL for read/write concurrency between an open screen and a background write;
// foreign_keys ON so `ON DELETE SET NULL` is enforced (§19.0).
sqlite.execSync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

export const db = drizzle(sqlite, { schema });
