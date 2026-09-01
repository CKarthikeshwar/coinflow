/**
 * Idempotent category seed (SPEC-implementation.md §20.5). Runs in `<MigrationGate>` after
 * `migrate()`, guarded by `app_setting.schemaSeededVersion`.
 *
 * Merge rule: add missing `key`s only, never overwrite a row the user modified
 * (`ON CONFLICT(key) DO NOTHING`). Bump `SEED_VERSION` when the seed content changes.
 */

import { eq } from 'drizzle-orm';
import { randomUUID } from 'expo-crypto';

import { db } from './client';
import { SEED_CATEGORIES, SEED_VERSION, SEEDED_VERSION_KEY } from './seed-data';
import { appSettings, categories } from './schema';

export { SEED_CATEGORIES, SEED_VERSION, SEEDED_VERSION_KEY } from './seed-data';
export type { SeededCategory } from './seed-data';

function readSeededVersion(): number {
  const row = db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, SEEDED_VERSION_KEY))
    .get();
  if (!row) return 0;
  try {
    const n = JSON.parse(row.value);
    return typeof n === 'number' ? n : 0;
  } catch {
    return 0;
  }
}

function writeSeededVersion(now: number): void {
  const value = JSON.stringify(SEED_VERSION);
  db.insert(appSettings)
    .values({ key: SEEDED_VERSION_KEY, value, updatedAt: now })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: now } })
    .run();
}

/** Add any missing default categories. Never overwrites a user-modified row. */
export function seedDatabase(): void {
  if (readSeededVersion() >= SEED_VERSION) return;
  const now = Date.now();
  db.transaction((tx) => {
    for (const c of SEED_CATEGORIES) {
      tx.insert(categories)
        .values({
          id: randomUUID(),
          key: c.key,
          name: c.name,
          icon: c.icon,
          kind: c.kind,
          isProtected: c.isProtected,
          order: c.order,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing({ target: categories.key })
        .run();
    }
    writeSeededVersion(now);
  });
}

/** Force the seeded rows back to their default name/icon/order — used by Clear all data (§20.7). */
export function resetSeededCategories(): void {
  const now = Date.now();
  db.transaction((tx) => {
    for (const c of SEED_CATEGORIES) {
      tx.insert(categories)
        .values({
          id: randomUUID(),
          key: c.key,
          name: c.name,
          icon: c.icon,
          kind: c.kind,
          isProtected: c.isProtected,
          order: c.order,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: categories.key,
          set: {
            name: c.name,
            icon: c.icon,
            kind: c.kind,
            isProtected: c.isProtected,
            order: c.order,
            updatedAt: now,
          },
        })
        .run();
    }
    writeSeededVersion(now);
  });
}
