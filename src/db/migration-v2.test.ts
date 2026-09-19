/**
 * IMP-086 — the V2 migration is additive: a database that a V1 install created (migrations 0000–0001, with
 * real data in it) must open, migrate to 0002 and read back **exactly** as before.
 */

import { createMemoryDb, applyMigrations, migrationTags } from './test-support/memory-db';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const V1_LAST_TAG = '0001_fts_search';

function seedV1(raw: DatabaseSync) {
  raw.exec(`
    INSERT INTO category (id, key, name, icon, kind, isProtected, "order", createdAt, updatedAt)
      VALUES ('c-food', 'food', 'Food', 'utensils', 'default', 0, 1, 1, 1);
    INSERT INTO "transaction" (id, amountMinor, direction, type, categoryId, paymentMethod, account, normalizedAccountKey,
        note, description, searchText, occurredAt, createdAt, updatedAt, deletedAt, source, smsSender, smsReceivedAt, dedupeKey, editedByUser)
      VALUES ('t1', 45000, 'debit', 'expense', 'c-food', 'upi', 'Swiggy', 'swiggy', 'Dinner', NULL, 'dinner swiggy', 1790000000000, 2, 3, NULL, 'sms', 'VM-HDFCBK', 1790000000000, 'k1', 1),
             ('t2', 3800000, 'credit', 'income', NULL, 'bank_transfer', 'Employer', 'employer', 'Salary', NULL, 'salary employer', 1789000000000, 2, 3, NULL, 'manual', NULL, NULL, NULL, 0),
             ('t3', 999, 'debit', 'expense', NULL, NULL, NULL, NULL, 'Deleted', NULL, 'deleted', 1788000000000, 2, 3, 12345, 'manual', NULL, NULL, NULL, 0);
    INSERT INTO account_rule (normalizedKey, displayAccount, lastNote, categoryId, lastPaymentMethod, hitCount, createdAt, updatedAt)
      VALUES ('swiggy', 'Swiggy', 'Dinner', 'c-food', 'upi', 4, 1, 2);
    INSERT INTO suggestion (id, amountMinor, direction, occurredAt, account, normalizedKey, paymentMethod, smsSender, smsReceivedAt, dedupeKey, status, createdAt)
      VALUES ('s1', 12000, 'debit', 1790000000001, 'Zomato', 'zomato', 'upi', 'VM-ICICIB', 1790000000001, 'k2', 'pending', 5);
    INSERT INTO app_setting (key, value, updatedAt) VALUES ('onboardingDone', 'true', 1), ('smsLastStoreTriggerAt', '1789819490381', 2);
  `);
}

/** Every V1 table, ordered, as plain data — the snapshot we compare before/after. */
function readAllV1(raw: DatabaseSync) {
  const dump = (table: string, order: string) => raw.prepare(`SELECT * FROM "${table}" ORDER BY ${order}`).all();
  return {
    category: dump('category', 'id'),
    transaction: dump('transaction', 'id'),
    account_rule: dump('account_rule', 'normalizedKey'),
    suggestion: dump('suggestion', 'id'),
    app_setting: dump('app_setting', 'key'),
    fts: raw.prepare("SELECT rowid FROM transaction_fts WHERE transaction_fts MATCH 'dinner'").all(),
  };
}

describe('V2 migration 0002 (IMP-086)', () => {
  it('is the newest migration and ships as plain CREATE statements only (additive)', () => {
    expect(migrationTags().at(-1)).toBe('0002_v2_splits');
    const sql = readFileSync(join(__dirname, 'migrations', '0002_v2_splits.sql'), 'utf8');
    // every statement must be a CREATE — no DROP / ALTER / INSERT / UPDATE / DELETE touching existing data
    const statements = sql.split("--> statement-breakpoint").map((x) => x.trim()).filter(Boolean);
    expect(statements.length).toBeGreaterThan(0);
    for (const st of statements) {
      expect(['CREATE TABLE', 'CREATE INDEX', 'CREATE UNIQUE INDEX'].some((prefix) => st.startsWith(prefix))).toBe(true);
    }
    expect(sql.match(/CREATE TABLE/g)).toHaveLength(5);
  });

  it('reads back every V1 table byte-for-byte identical after upgrading a populated V1 database', () => {
    const { raw } = createMemoryDb({ upToTag: V1_LAST_TAG });
    seedV1(raw);
    const before = readAllV1(raw);
    expect(before.transaction).toHaveLength(3);
    expect(before.fts).toHaveLength(1); // FTS index was populated by the V1 triggers

    applyMigrations(raw, undefined, V1_LAST_TAG); // only 0002 on top of the populated V1 database

    expect(readAllV1(raw)).toEqual(before);
  });

  it('adds the five V2 tables, empty, with foreign keys on', () => {
    const { raw } = createMemoryDb({ upToTag: V1_LAST_TAG });
    seedV1(raw);
    applyMigrations(raw, undefined, V1_LAST_TAG);
    for (const t of ['person', 'split', 'split_share', 'split_request_in', 'settlement']) {
      expect(raw.prepare(`SELECT count(*) AS c FROM "${t}"`).get()).toEqual({ c: 0 });
    }
    expect(raw.prepare('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 });
    expect(raw.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });

  it('keeps V1 behaviour working afterwards: soft-deleted rows stay, and the FTS triggers still index new rows', () => {
    const { raw } = createMemoryDb({ upToTag: V1_LAST_TAG });
    seedV1(raw);
    applyMigrations(raw, undefined, V1_LAST_TAG);
    expect(raw.prepare('SELECT count(*) AS c FROM "transaction" WHERE deletedAt IS NOT NULL').get()).toEqual({ c: 1 });
    raw.exec(`INSERT INTO "transaction" (id, amountMinor, direction, type, occurredAt, createdAt, updatedAt, source, note, editedByUser)
              VALUES ('t9', 100, 'debit', 'expense', 1, 1, 1, 'manual', 'momos night', 0)`);
    expect(raw.prepare("SELECT rowid FROM transaction_fts WHERE transaction_fts MATCH 'momos'").all()).toHaveLength(1);
  });

  it('a V2 split can hang off a V1 transaction, and purging that transaction cascades cleanly', () => {
    const { raw } = createMemoryDb({ upToTag: V1_LAST_TAG });
    seedV1(raw);
    applyMigrations(raw, undefined, V1_LAST_TAG);
    raw.exec(`
      INSERT INTO person (id, displayName, phoneKey, source, createdAt, updatedAt) VALUES ('p1', 'Rahul', '9845897555', 'manual', 1, 1);
      INSERT INTO split (id, ref, transactionId, createdAt, updatedAt) VALUES ('sp1', 'ab2cd3', 't1', 1, 1);
      INSERT INTO split_share (id, splitId, personId, amountMinor, createdAt, updatedAt) VALUES ('sh1', 'sp1', 'p1', 15000, 1, 1);
      INSERT INTO settlement (id, shareId, transactionId, amountMinor, createdAt) VALUES ('st1', 'sh1', 't2', 15000, 1);
    `);
    raw.exec("DELETE FROM \"transaction\" WHERE id = 't1'");
    for (const t of ['split', 'split_share', 'settlement']) {
      expect(raw.prepare(`SELECT count(*) AS c FROM "${t}"`).get()).toEqual({ c: 0 });
    }
    expect(raw.prepare("SELECT count(*) AS c FROM person").get()).toEqual({ c: 1 });
    expect(raw.prepare("SELECT count(*) AS c FROM \"transaction\" WHERE id = 't2'").get()).toEqual({ c: 1 });
  });
});
