/**
 * FILE PURPOSE
 * ------------
 * Makes sure the built-in default categories (Food, Travel, Shopping, ...) exist in the
 * database. Runs every time the app starts, but is safe to run repeatedly — it only adds
 * categories that are missing, it never overwrites one a user has already renamed or edited.
 *
 * WHERE IT FITS
 * -------------
 * Called by `src/db/migration-gate.tsx` right after the SQLite migrations finish, before the
 * app is allowed to render. Also called by `resetSeededCategories` from
 * `src/db/maintenance.ts`'s `clearAllData` (Settings → "Clear all data"), which forces the
 * seeded categories back to their original name/icon/order.
 *
 * IMPORTANT
 * ---------
 * The "add if missing, never overwrite" behavior (`ON CONFLICT(key) DO NOTHING` in
 * `seedDatabase`) is what protects a user's customization — if the app shipped a new default
 * category in a future update, this logic adds it without touching anything the user already
 * renamed. `SEEDED_VERSION_KEY` in `app_setting` tracks which seed version has already run, so
 * on every normal startup this is a near-instant no-op once the device is already seeded. If
 * you add/change a default category in `seed-data.ts`, remember to bump `SEED_VERSION` there —
 * otherwise this function will skip re-checking and the change won't reach existing installs.
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
