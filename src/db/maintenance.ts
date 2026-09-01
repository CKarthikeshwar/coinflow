/**
 * Launch maintenance and whole-database operations (SPEC-implementation.md §20.4–§20.7,
 * §21.6). `runLaunchMaintenance` is what `<MigrationGate>` runs; `ensureMigrated` is the
 * shared guard every headless task calls before any read/write (§20.4).
 */

import { and, eq, isNotNull, lt } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';

import { db, sqlite } from './client';
import { isFtsAvailable } from './fts';
import migrationsBundle from './migrations/migrations';
import { resetSeededCategories, seedDatabase } from './seed';
import { accountRules, appSettings, categories, suggestions, transactions } from './schema';

// well past the 5 s Undo window + snackbar (§20.6)
const PURGE_GRACE_MS = 60_000;
const CONFIRMED_SUGGESTION_TTL_MS = 86_400_000; // 24 h

const migrations = migrationsBundle as unknown as Parameters<typeof migrate>[1];

/** Run any unapplied migrations. Safe to call from a headless task (§20.4). */
export async function ensureMigrated(): Promise<void> {
  await migrate(db, migrations);
}

/** §20.6 — hard-purge soft-deleted transactions past the grace window + stale confirmed suggestions. */
export function purge(nowMs: number = Date.now()): void {
  db.delete(transactions)
    .where(and(isNotNull(transactions.deletedAt), lt(transactions.deletedAt, nowMs - PURGE_GRACE_MS)))
    .run();
  db.delete(suggestions)
    .where(and(eq(suggestions.status, 'confirmed'), lt(suggestions.createdAt, nowMs - CONFIRMED_SUGGESTION_TTL_MS)))
    .run();
  db.insert(appSettings)
    .values({ key: 'lastPurgeAt', value: JSON.stringify(nowMs), updatedAt: nowMs })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: JSON.stringify(nowMs), updatedAt: nowMs } })
    .run();
}

export type LaunchMaintenanceResult = { ftsAvailable: boolean };

/** migrate → seed → purge. Returns a summary for logging (§20.4–§20.6). */
export async function runLaunchMaintenance(): Promise<LaunchMaintenanceResult> {
  await migrate(db, migrations);
  seedDatabase();
  purge();
  return { ftsAvailable: isFtsAvailable() };
}

/** §20.7 — wipe everything, reset the seeded rows, drop all settings (⇒ back to onboarding). */
export function clearAllData(): void {
  db.transaction((tx) => {
    tx.delete(suggestions).run();
    tx.delete(transactions).run(); // FTS rows follow via the §19.6 delete trigger
    tx.delete(accountRules).run();
    tx.delete(categories).where(eq(categories.kind, 'custom')).run();
    tx.delete(appSettings).run();
  });
  resetSeededCategories();
  sqlite.execSync('VACUUM;');
}
