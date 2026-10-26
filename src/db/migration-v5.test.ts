/**
 * CR-34 — migration 0005 (My accounts, §46.2) is additive: a populated 0004 database must open, migrate and read back
 * exactly as before. Existing transactions / suggestions get `accountId = null` ("No account") — no backfill (D48).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { applyMigrations, createMemoryDb, migrationTags } from './test-support/memory-db';

const V4_TAG = '0004_dismissed_suggestion_tombstone';
const V5_TAG = '0005_my_accounts';

function seedV4(raw: DatabaseSync) {
  raw.exec(`
    INSERT INTO "transaction" (id, amountMinor, direction, type, occurredAt, createdAt, updatedAt, source)
      VALUES ('t1', 14000, 'debit', 'expense', 1790000000000, 1, 1, 'sms'),
             ('t2', 500000, 'credit', 'income', 1789000000000, 2, 2, 'manual');
    INSERT INTO suggestion (id, amountMinor, direction, smsSender, smsReceivedAt, dedupeKey, status, createdAt)
      VALUES ('s1', 14000, 'debit', 'AD-CANBNK-S', 1790000000000, 'k1', 'pending', 1);
  `);
}

describe('migration 0005 (CR-34)', () => {
  it('is in the journal and never drops or rewrites anything', () => {
    expect(migrationTags()).toContain(V5_TAG);
    const sql = readFileSync(join(__dirname, 'migrations', `${V5_TAG}.sql`), 'utf8');
    expect(sql).not.toMatch(/\bDROP\b|^\s*UPDATE\b|DELETE FROM|INSERT INTO/im);
    expect(sql.match(/CREATE TABLE/g)).toHaveLength(2);
  });

  it('keeps every existing row, each with no account and no transfer peer', () => {
    const { raw } = createMemoryDb({ upToTag: V4_TAG });
    seedV4(raw);
    applyMigrations(raw, V5_TAG, V4_TAG);

    expect(raw.prepare('SELECT id, accountId, transferPeerId FROM "transaction" ORDER BY id').all()).toEqual([
      { id: 't1', accountId: null, transferPeerId: null },
      { id: 't2', accountId: null, transferPeerId: null },
    ]);
    expect(raw.prepare('SELECT id, accountId FROM suggestion').all()).toEqual([{ id: 's1', accountId: null }]);
    expect(raw.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });

  it('deleting an account sets its transactions to "No account" and removes its balances', () => {
    const { raw } = createMemoryDb();
    raw.exec(`
      INSERT INTO my_account (id, kind, nickname, matchKey, createdAt, updatedAt) VALUES ('a1', 'bank', 'HDFC ··672', 'hdfc:672', 1, 1);
      INSERT INTO "transaction" (id, amountMinor, direction, type, occurredAt, createdAt, updatedAt, source, accountId)
        VALUES ('t1', 100, 'debit', 'expense', 1, 1, 1, 'sms', 'a1');
      INSERT INTO account_balance (id, accountId, balanceMinor, asOf, source, dedupeKey) VALUES ('b1', 'a1', 5, 1, 'sms', 'a1:1:5');
      DELETE FROM my_account WHERE id = 'a1';
    `);
    expect(raw.prepare('SELECT accountId FROM "transaction"').get()).toEqual({ accountId: null });
    expect(raw.prepare('SELECT count(*) AS n FROM account_balance').get()).toEqual({ n: 0 });
  });

  it('allows many accounts without a matchKey but never two with the same one', () => {
    const { raw } = createMemoryDb();
    raw.exec(`
      INSERT INTO my_account (id, kind, nickname, createdAt, updatedAt) VALUES ('c1', 'cash', 'Cash', 1, 1), ('c2', 'cash', 'Cash 2', 1, 1);
      INSERT INTO my_account (id, kind, nickname, matchKey, createdAt, updatedAt) VALUES ('a1', 'bank', 'A', 'sbi:1234', 1, 1);
    `);
    expect(() =>
      raw.exec(`INSERT INTO my_account (id, kind, nickname, matchKey, createdAt, updatedAt) VALUES ('a2', 'bank', 'B', 'sbi:1234', 1, 1)`),
    ).toThrow(/UNIQUE/);
  });
});
