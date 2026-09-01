/**
 * The one database handle (SPEC-implementation.md §20.1). `openDatabaseSync` (not the
 * async variant) so the headless tasks (§17) and the UI share one code path.
 * `enableChangeListener` is what makes Drizzle's `useLiveQuery` re-emit (§22).
 */

import { drizzle } from 'drizzle-orm/expo-sqlite';
import * as SQLite from 'expo-sqlite';

import { schema } from './schema';

export const sqlite = SQLite.openDatabaseSync('coinflow.db', { enableChangeListener: true });

// WAL for read/write concurrency between an open screen and a background write;
// foreign_keys ON so `ON DELETE SET NULL` is enforced (§19.0).
sqlite.execSync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

export const db = drizzle(sqlite, { schema });
