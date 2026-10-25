/**
 * CR-30 — migration 0004 (dismissed-suggestion tombstone) is additive: a populated 0003 database must open, migrate
 * and read back exactly as before, with the new `dismissedAt` column defaulting to null.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { applyMigrations, createMemoryDb, migrationTags } from './test-support/memory-db';

const V3_TAG = '0003_income_categories';
const V4_TAG = '0004_dismissed_suggestion_tombstone';

function seedV3(raw: DatabaseSync) {
  raw.exec(`
    INSERT INTO suggestion (id, amountMinor, direction, occurredAt, account, normalizedKey, paymentMethod,
        smsSender, smsReceivedAt, dedupeKey, status, createdAt)
      VALUES ('s1', 14000, 'debit', 1790000000000, 'Akarsh', 'akarsh', 'upi', 'AD-CANBNK-S', 1790000000000, 'k1', 'pending', 1),
             ('s2', 500000, 'credit', 1789000000000, 'Employer', 'employer', 'bank_transfer', 'AD-CANBNK-S', 1789000000000, 'k2', 'confirmed', 2);
  `);
}

describe('migration 0004 (CR-30)', () => {
  it('is in the journal and only adds one column (no DROP / data rewrite)', () => {
    expect(migrationTags()).toContain(V4_TAG);
    const sql = readFileSync(join(__dirname, 'migrations', `${V4_TAG}.sql`), 'utf8');
    const statements = sql.split('--> statement-breakpoint').map((x) => x.trim()).filter(Boolean);
    expect(statements).toHaveLength(1);
    expect(statements[0].startsWith('ALTER TABLE')).toBe(true);
  });

  it('keeps every existing suggestion row, with dismissedAt defaulting to null', () => {
    const { raw } = createMemoryDb({ upToTag: V3_TAG });
    seedV3(raw);
    applyMigrations(raw, V4_TAG, V3_TAG);

    expect(raw.prepare('SELECT id, status, dismissedAt FROM suggestion ORDER BY id').all()).toEqual([
      { id: 's1', status: 'pending', dismissedAt: null },
      { id: 's2', status: 'confirmed', dismissedAt: null },
    ]);
    expect(raw.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });

  it("accepts the new 'dismissed' status and a dismissedAt timestamp", () => {
    const { raw } = createMemoryDb();
    raw.exec(`
      INSERT INTO suggestion (id, smsSender, smsReceivedAt, dedupeKey, status, dismissedAt, createdAt)
        VALUES ('s3', 'AD-CANBNK-S', 1, 'k3', 'dismissed', 12345, 1);
    `);
    expect(raw.prepare("SELECT status, dismissedAt FROM suggestion WHERE id = 's3'").get()).toEqual({
      status: 'dismissed',
      dismissedAt: 12345,
    });
  });
});
