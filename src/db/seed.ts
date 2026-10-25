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

import { and, eq, sql } from 'drizzle-orm';
import { randomUUID } from 'expo-crypto';

import { db } from './client';
import { ICON_REFRESH_V3, SEED_CATEGORIES, SEED_VERSION, SEEDED_VERSION_KEY } from './seed-data';
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

/**
 * Add the default categories this install has not been seeded with yet. Never overwrites a user-modified row.
 *
 * CR-29: an upgrade only inserts rows introduced after the install's last seed version (`since`), so a default the
 * user deleted stays deleted — protected rows (Uncategorized, Other, Other income) are the exception, the app needs
 * them. Rows added by an upgrade go after the current last category, so they never interleave with the user's own.
 */
export function seedDatabase(): void {
  const seeded = readSeededVersion();
  if (seeded >= SEED_VERSION) return;
  const now = Date.now();
  db.transaction((tx) => {
    const maxOrder =
      tx.select({ v: sql<number>`coalesce(max(${categories.order}), -1)` }).from(categories).get()?.v ?? -1;
    let nextOrder = maxOrder + 1;
    for (const c of SEED_CATEGORIES) {
      if (c.since <= seeded && !c.isProtected) continue; // already offered once — the user may have deleted it
      // CR-28: category names are unique across expense + income. A seed row whose name the user already
      // took with their own category (e.g. a custom "Gift") is skipped rather than duplicated.
      const nameUsed = tx
        .select({ id: categories.id })
        .from(categories)
        .where(sql`lower(${categories.name}) = lower(${c.name}) AND ${categories.key} IS NOT ${c.key}`)
        .get();
      if (nameUsed) continue;
      const res = tx
        .insert(categories)
        .values({
          id: randomUUID(),
          key: c.key,
          name: c.name,
          icon: c.icon,
          kind: c.kind,
          appliesTo: c.appliesTo,
          isProtected: c.isProtected,
          // a fresh install keeps the designed order; an upgrade appends after whatever is there now
          order: seeded === 0 ? c.order : nextOrder,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing({ target: categories.key })
        .run();
      if (res.changes > 0) nextOrder += 1;
    }
    // CR-31: an install seeded before v3 still has the old generic income icons — swap them, but only where the
    // row still holds the old default (an icon the user chose is left alone).
    if (seeded > 0 && seeded < 3) {
      for (const { key, from, to } of ICON_REFRESH_V3) {
        tx.update(categories)
          .set({ icon: to, updatedAt: now })
          .where(and(eq(categories.key, key), eq(categories.icon, from)))
          .run();
      }
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
          appliesTo: c.appliesTo,
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
            appliesTo: c.appliesTo,
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
