/**
 * FILE PURPOSE — TEST-ONLY
 * ------------------------
 * A real, in-memory SQLite database (Node's built-in `node:sqlite`) wired into Drizzle through a tiny
 * adapter that speaks the same synchronous client interface as `expo-sqlite`, so the repositories run
 * their *actual* SQL in unit tests — foreign keys, cascades, UNIQUE / CHECK constraints, transactions —
 * instead of against a hand-written mock that can only echo what it was told to.
 *
 * It also applies the **real generated migration files** from `src/db/migrations/` (the exact SQL the
 * phone runs, in journal order), so a test that passes here has run the shipped migrations.
 *
 * Never imported by app code; Jest only (`node:sqlite` does not exist on the phone).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync, type StatementSync } from 'node:sqlite';

import { drizzle } from 'drizzle-orm/expo-sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';

import { schema } from '../schema';

const MIGRATIONS_DIR = join(__dirname, '..', 'migrations');

type Row = Record<string, unknown>;

/** Just the slice of `expo-sqlite`'s client that `drizzle-orm/expo-sqlite` calls. */
function makeClient(raw: DatabaseSync) {
  return {
    prepareSync(sql: string) {
      const stmt: StatementSync = raw.prepare(sql);
      const arrayStmt: StatementSync = raw.prepare(sql);
      arrayStmt.setReturnArrays(true);
      const returnsRows = stmt.columns().length > 0;
      return {
        executeSync(params: unknown[]) {
          if (!returnsRows) {
            const r = stmt.run(...(params as never[]));
            return {
              changes: Number(r.changes),
              lastInsertRowId: Number(r.lastInsertRowid),
              getAllSync: (): Row[] => [],
              getFirstSync: (): Row | null => null,
            };
          }
          const rows = stmt.all(...(params as never[])) as Row[];
          return { changes: 0, lastInsertRowId: 0, getAllSync: () => rows, getFirstSync: () => rows[0] ?? null };
        },
        executeForRawResultSync(params: unknown[]) {
          const rows = arrayStmt.all(...(params as never[])) as unknown as unknown[][];
          return { getAllSync: () => rows };
        },
      };
    },
  };
}

/** Migration tags in journal order, e.g. `['0000_equal_martin_li', '0001_fts_search', '0002_v2_splits']`. */
export function migrationTags(): string[] {
  const journal = JSON.parse(readFileSync(join(MIGRATIONS_DIR, 'meta', '_journal.json'), 'utf8')) as {
    entries: { tag: string }[];
  };
  return journal.entries.map((e) => e.tag);
}

/**
 * Runs the shipped `.sql` migrations in journal order. `upToTag` stops after that migration (inclusive);
 * `afterTag` skips everything up to and including that migration — together they let a test build a V1-era
 * database (`upToTag: '0001_fts_search'`) and then apply only the V2 migration on top (`afterTag`).
 */
export function applyMigrations(raw: DatabaseSync, upToTag?: string, afterTag?: string): void {
  let skipping = afterTag !== undefined;
  for (const tag of migrationTags()) {
    if (skipping) {
      if (tag === afterTag) skipping = false;
      continue;
    }
    const sqlText = readFileSync(join(MIGRATIONS_DIR, `${tag}.sql`), 'utf8');
    for (const statement of sqlText.split('--> statement-breakpoint')) {
      if (statement.trim()) raw.exec(statement);
    }
    if (tag === upToTag) break;
  }
}

/** A fresh in-memory database with every migration applied and foreign keys enforced (as on the phone). */
export function createMemoryDb(options: { upToTag?: string } = {}) {
  const raw = new DatabaseSync(':memory:');
  raw.exec('PRAGMA foreign_keys = ON;');
  applyMigrations(raw, options.upToTag);
  const db = drizzle(makeClient(raw) as unknown as SQLiteDatabase, { schema });
  return { db, raw, close: () => raw.close() };
}

export type MemoryDb = ReturnType<typeof createMemoryDb>['db'];
