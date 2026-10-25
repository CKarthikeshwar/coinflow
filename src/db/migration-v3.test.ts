/**
 * CR-28 — migration 0003 (income categories) is additive: a populated 0002 database must open, migrate and read back
 * exactly as before, with the two new columns defaulting sensibly.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { applyMigrations, createMemoryDb, migrationTags } from './test-support/memory-db';

const V2_TAG = '0002_v2_splits';
const V3_TAG = '0003_income_categories';

function seedV2(raw: DatabaseSync) {
  raw.exec(`
    INSERT INTO category (id, key, name, icon, kind, isProtected, "order", createdAt, updatedAt)
      VALUES ('c-food', 'food', 'Food', 'utensils', 'default', 0, 1, 1, 1);
    INSERT INTO "transaction" (id, amountMinor, direction, type, categoryId, occurredAt, createdAt, updatedAt, source, editedByUser)
      VALUES ('t1', 45000, 'debit', 'expense', 'c-food', 1790000000000, 2, 3, 'manual', 0),
             ('t2', 3800000, 'credit', 'income', NULL, 1789000000000, 2, 3, 'manual', 0);
    INSERT INTO account_rule (normalizedKey, displayAccount, lastNote, categoryId, lastPaymentMethod, hitCount, createdAt, updatedAt)
      VALUES ('swiggy', 'Swiggy', 'Dinner', 'c-food', 'upi', 4, 1, 2);
  `);
}

const SALARY_CATEGORY = `
  INSERT INTO category (id, key, name, icon, kind, appliesTo, isProtected, "order", createdAt, updatedAt)
    VALUES ('c-salary', 'salary', 'Salary', 'briefcase', 'default', 'income', 0, 10, 1, 1);
`;

describe('migration 0003 (CR-28)', () => {
  it('is in the journal and only adds two columns (no DROP / data rewrite)', () => {
    expect(migrationTags()).toContain(V3_TAG);
    const sql = readFileSync(join(__dirname, 'migrations', `${V3_TAG}.sql`), 'utf8');
    const statements = sql.split('--> statement-breakpoint').map((x) => x.trim()).filter(Boolean);
    expect(statements).toHaveLength(2);
    for (const st of statements) expect(st.startsWith('ALTER TABLE')).toBe(true);
  });

  it('keeps every existing row; old categories become expense, old rules have no income category', () => {
    const { raw } = createMemoryDb({ upToTag: V2_TAG });
    seedV2(raw);
    applyMigrations(raw, V3_TAG, V2_TAG);

    expect(raw.prepare('SELECT id, name, appliesTo FROM category').all()).toEqual([
      { id: 'c-food', name: 'Food', appliesTo: 'expense' },
    ]);
    expect(raw.prepare('SELECT normalizedKey, categoryId, incomeCategoryId FROM account_rule').all()).toEqual([
      { normalizedKey: 'swiggy', categoryId: 'c-food', incomeCategoryId: null },
    ]);
    expect(raw.prepare('SELECT count(*) AS c FROM "transaction"').get()).toEqual({ c: 2 });
    // an old income transaction stays uncategorized
    expect(raw.prepare("SELECT categoryId FROM \"transaction\" WHERE id = 't2'").get()).toEqual({ categoryId: null });
    expect(raw.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });

  it('allows an income category on a transaction and a remembered income category on a rule', () => {
    const { raw } = createMemoryDb();
    raw.exec(`${SALARY_CATEGORY}
      INSERT INTO "transaction" (id, amountMinor, direction, type, categoryId, occurredAt, createdAt, updatedAt, source, editedByUser)
        VALUES ('t3', 5000000, 'credit', 'income', 'c-salary', 1, 1, 1, 'manual', 0);
      INSERT INTO account_rule (normalizedKey, displayAccount, incomeCategoryId, hitCount, createdAt, updatedAt)
        VALUES ('employer', 'Employer', 'c-salary', 1, 1, 1);
    `);
    expect(raw.prepare("SELECT categoryId FROM \"transaction\" WHERE id = 't3'").get()).toEqual({ categoryId: 'c-salary' });
  });

  it("deleting an income category clears a rule's remembered income category (ON DELETE SET NULL)", () => {
    const { raw } = createMemoryDb();
    raw.exec(`${SALARY_CATEGORY}
      INSERT INTO account_rule (normalizedKey, displayAccount, incomeCategoryId, hitCount, createdAt, updatedAt)
        VALUES ('employer', 'Employer', 'c-salary', 1, 1, 1);
      DELETE FROM category WHERE id = 'c-salary';
    `);
    expect(raw.prepare('SELECT incomeCategoryId FROM account_rule').get()).toEqual({ incomeCategoryId: null });
  });
});
