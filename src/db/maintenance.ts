/**
 * FILE PURPOSE
 * ------------
 * Whole-database housekeeping: running migrations, cleaning up old soft-deleted rows, and
 * wiping everything for the "Clear all data" settings option.
 *
 * WHERE IT FITS
 * -------------
 * - `ensureMigrated` is called by `src/services/tasks/sms-ingest.ts` before it touches the
 *   database — this guards against the rare case where a background SMS arrives before the app
 *   has ever been opened (and therefore before the app's normal startup migration has run).
 * - `purge` is called by `src/db/migration-gate.tsx` once at every app startup (see IMPORTANT
 *   below) to hard-delete transactions that were soft-deleted more than a minute ago (the Undo
 *   window is 5 seconds, so a minute is a safe margin) and old confirmed suggestions.
 * - `clearAllData` is called by `src/app/data.tsx`'s "Clear all data" button (Settings → Data).
 *
 * DATA FLOW
 * ---------
 * `clearAllData` wipes `suggestions`, `transactions`, `accountRules`, and any custom
 * categories, then re-seeds the default categories and runs SQLite's `VACUUM` to actually
 * reclaim disk space — the net effect is the app returning to a fresh-install state, which
 * `src/app/data.tsx` follows with a relaunch back into onboarding.
 *
 * IMPORTANT
 * ---------
 * `runLaunchMaintenance` below is NOT currently called anywhere in the app — despite what an
 * earlier version of this comment said, `<MigrationGate>` (`src/db/migration-gate.tsx`) does
 * NOT call it. Instead, `MigrationGate` calls `seedDatabase()`, `purge()`, and
 * `isFtsAvailable()` directly, inline in its own effect, duplicating what this function does.
 * This looks like dead code left over from a refactor — see the "things to investigate" note
 * for this file.
 */

import { and, eq, isNotNull, lt } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';

import { db, sqlite } from './client';
import { isFtsAvailable } from './fts';
import migrationsBundle from './migrations/migrations';
import { resetSeededCategories, seedDatabase } from './seed';
import { purgeRequestTombstones } from './repositories/split-requests';
import { purgeOldSnapshots } from './repositories/balances';
import { purgeStaleCardBillHints } from './repositories/transfers';
import {
  accountRules,
  appSettings,
  categories,
  persons,
  settlements,
  splitRequestsIn,
  splitShares,
  splits,
  suggestions,
  transactions,
} from './schema';

// well past the 5 s Undo window + snackbar (§20.6)
const PURGE_GRACE_MS = 60_000;
const CONFIRMED_SUGGESTION_TTL_MS = 86_400_000; // 24 h
// CR-30 — must stay comfortably above `sms-reconcile.ts`'s 48h sweep lookback: purging a dismissed
// tombstone sooner would let the sweep re-create the very suggestion it was meant to block, if it
// runs again while the original SMS is still inside that 48h window.
const DISMISSED_SUGGESTION_TTL_MS = 4 * 86_400_000; // 4 days

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
  // CR-30: a dismissed tombstone is only safe to drop once the SMS-reconcile sweep can no longer reach that
  // message (`dismissedAt`, not `createdAt` — the SMS could already have been old when it was dismissed).
  db.delete(suggestions)
    .where(and(eq(suggestions.status, 'dismissed'), lt(suggestions.dismissedAt, nowMs - DISMISSED_SUGGESTION_TTL_MS)))
    .run();
  // V2 (§20.6, CR-17): rows that cascade with a purged transaction (split, shares, settlements) go with it via
  // the foreign keys; received-request tombstones (rejected / withdrawn) expire 30 days after their last change.
  purgeRequestTombstones(nowMs);
  purgeStaleCardBillHints(nowMs); // CR-34 — card-bill hints nobody answered within 30 days
  purgeOldSnapshots(nowMs); // CR-34 (§46.2) — newest 200 per account, nothing past 90 days but the newest
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
    // V2 tables first, children before parents (IMP-087) — the FKs cascade anyway, this keeps it explicit.
    tx.delete(settlements).run();
    tx.delete(splitRequestsIn).run();
    tx.delete(splitShares).run();
    tx.delete(splits).run();
    tx.delete(persons).run();
    tx.delete(suggestions).run();
    tx.delete(transactions).run(); // FTS rows follow via the §19.6 delete trigger
    tx.delete(accountRules).run();
    tx.delete(categories).where(eq(categories.kind, 'custom')).run();
    tx.delete(appSettings).run();
  });
  resetSeededCategories();
  sqlite.execSync('VACUUM;');
}
