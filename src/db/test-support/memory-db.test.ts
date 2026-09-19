import { eq } from 'drizzle-orm';

import { appSettings, transactions } from '../schema';
import { createMemoryDb, migrationTags } from './memory-db';

describe('memory-db test harness', () => {
  it('applies every shipped migration (including FTS5) to a real in-memory SQLite', () => {
    const { raw } = createMemoryDb();
    const tables = (raw.prepare("select name from sqlite_master where type='table'").all() as { name: string }[]).map(
      (r) => r.name,
    );
    for (const t of [
      'transaction', 'category', 'account_rule', 'suggestion', 'app_setting', 'transaction_fts',
      'person', 'split', 'split_share', 'split_request_in', 'settlement',
    ]) {
      expect(tables).toContain(t);
    }
    expect(migrationTags().at(-1)).toBe('0002_v2_splits');
  });

  it('round-trips typed rows through Drizzle (insert / select / update / delete)', () => {
    const { db } = createMemoryDb();
    db.insert(appSettings).values({ key: 'k', value: '"v"', updatedAt: 1 }).run();
    expect(db.select().from(appSettings).where(eq(appSettings.key, 'k')).get()).toMatchObject({ key: 'k', value: '"v"' });
    db.update(appSettings).set({ value: '"w"' }).where(eq(appSettings.key, 'k')).run();
    expect(db.select().from(appSettings).all()[0].value).toBe('"w"');
    db.delete(appSettings).where(eq(appSettings.key, 'k')).run();
    expect(db.select().from(appSettings).all()).toEqual([]);
  });

  it('enforces foreign keys and rolls a failed transaction back', () => {
    const { db } = createMemoryDb();
    expect(() =>
      db.transaction((tx) => {
        tx.insert(appSettings).values({ key: 'a', value: '1', updatedAt: 1 }).run();
        // a transaction row with an unknown categoryId must violate the FK
        tx.insert(transactions)
          .values({
            id: 't1', amountMinor: 100, direction: 'debit', type: 'expense', categoryId: 'no-such-category',
            occurredAt: 1, source: 'manual',
          })
          .run();
      }),
    ).toThrow();
    expect(db.select().from(appSettings).all()).toEqual([]); // the first insert was rolled back too
  });

  it('can stop at an earlier migration to build a V1-era database', () => {
    const { raw } = createMemoryDb({ upToTag: '0001_fts_search' });
    const names = (raw.prepare("select name from sqlite_master where type='table'").all() as { name: string }[]).map((r) => r.name);
    expect(names).toContain('transaction');
    expect(names).not.toContain('person');
  });
});
