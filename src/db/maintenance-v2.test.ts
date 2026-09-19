/**
 * IMP-087 / §20.6 — "Clear all data" and the launch purge know about the V2 tables. Runs the real
 * `maintenance.ts` against the real in-memory database (only the native pieces are stubbed).
 */

import { eq } from 'drizzle-orm';

import { clearAllData, purge } from './maintenance';
import { findOrCreatePerson } from './repositories/persons';
import { settle } from './repositories/settlements';
import { acceptRequest, receiveRequest, rejectRequest, TOMBSTONE_TTL_MS } from './repositories/split-requests';
import { createSplit } from './repositories/splits';
import { appSettings, persons, settlements, splitRequestsIn, splitShares, splits, transactions } from './schema';
import { insertTransaction } from './test-support/fixtures';
import { createMemoryDb } from './test-support/memory-db';

let mockMem: ReturnType<typeof createMemoryDb>;
let mockCounter = 0;
jest.mock('./client', () => ({
  get db() {
    return mockMem.db;
  },
  get sqlite() {
    return { execSync: (sql: string) => mockMem.raw.exec(sql) };
  },
}));
jest.mock('expo-crypto', () => ({
  randomUUID: () => `id-${++mockCounter}`,
  getRandomBytes: (n: number) => Uint8Array.from({ length: n }, (_v, i) => (mockCounter * 47 + i * 23) % 256),
}));
// the bundle imports `.sql` files that Jest cannot load, and the migrator needs the native driver
jest.mock('./migrations/migrations', () => ({ __esModule: true, default: {} }));
jest.mock('drizzle-orm/expo-sqlite/migrator', () => ({ migrate: jest.fn() }));
jest.mock('./fts', () => ({ isFtsAvailable: () => true }));
jest.mock('./seed', () => ({ resetSeededCategories: jest.fn(), seedDatabase: jest.fn() }));

const db = () => mockMem.db;

function populate() {
  const txn = insertTransaction(db(), { amountMinor: 120_000 });
  const c = insertTransaction(db(), { direction: 'credit', type: 'income', amountMinor: 30_000 });
  const rahul = findOrCreatePerson({ displayName: 'Rahul', phone: '9845897555', source: 'manual' });
  const v = createSplit({ transactionId: txn.id, shares: [{ personId: rahul.id, amountMinor: 30_000 }] });
  settle({ transactionId: c.id, picks: [{ shareId: v.shares[0].id }] });
  const r = receiveRequest({ fromPhone: '9742590888', ref: 'ab2cd3', amountMinor: 45_000 }, 1000);
  if (r.kind !== 'created') throw new Error('setup');
  acceptRequest(r.request.id);
  db().insert(appSettings).values({ key: 'onboardingDone', value: 'true', updatedAt: 1 }).run();
  return { txn, c, r: r.request };
}

beforeEach(() => {
  mockMem?.close();
  mockMem = createMemoryDb();
  mockCounter = 0;
});

describe('clearAllData (IMP-087)', () => {
  it('empties every V2 table along with the V1 data', () => {
    populate();
    expect(db().select().from(splits).all()).toHaveLength(1);
    clearAllData();
    for (const table of [splits, splitShares, settlements, splitRequestsIn, persons, transactions, appSettings]) {
      expect(db().select().from(table).all()).toEqual([]);
    }
  });

  it('is safe on a database that never used splits', () => {
    insertTransaction(db());
    expect(() => clearAllData()).not.toThrow();
    expect(db().select().from(transactions).all()).toEqual([]);
  });
});

describe('purge (§20.6)', () => {
  it('a purged soft-deleted transaction takes its split, shares and settlements with it', () => {
    const { txn } = populate();
    db().update(transactions).set({ deletedAt: 1_000 }).where(eq(transactions.id, txn.id)).run();
    purge(1_000 + 61_000); // past the 60 s grace
    expect(db().select().from(transactions).where(eq(transactions.id, txn.id)).get()).toBeUndefined();
    expect(db().select().from(splits).all()).toEqual([]);
    expect(db().select().from(splitShares).all()).toEqual([]);
    expect(db().select().from(settlements).all()).toEqual([]);
    expect(db().select().from(persons).all().length).toBeGreaterThan(0); // people are kept
  });

  it('keeps a soft-deleted transaction (and its split) inside the Undo grace window', () => {
    const { txn } = populate();
    db().update(transactions).set({ deletedAt: 1_000 }).where(eq(transactions.id, txn.id)).run();
    purge(1_000 + 5_000);
    expect(db().select().from(splits).all()).toHaveLength(1);
  });

  it('expires rejected request tombstones after 30 days but never an open request', () => {
    const { r } = populate(); // accepted, old
    const rej = receiveRequest({ fromPhone: '9845897555', ref: 'zz2zz3', amountMinor: 100 }, 1000);
    if (rej.kind !== 'created') throw new Error('setup');
    rejectRequest(rej.request.id, 1000);
    purge(1000 + TOMBSTONE_TTL_MS + 1);
    expect(db().select().from(splitRequestsIn).all().map((x) => x.id)).toEqual([r.id]);
  });

  it('still stamps lastPurgeAt', () => {
    purge(4242);
    expect(db().select().from(appSettings).where(eq(appSettings.key, 'lastPurgeAt')).get()?.value).toBe('4242');
  });
});
