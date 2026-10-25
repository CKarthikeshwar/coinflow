/**
 * CR-28 — `seedDatabase` against the real in-memory SQLite: a fresh install gets all 17 categories, an upgrading
 * install (seed version 1 already applied) gets the 7 income ones without touching what is there, and a user's own
 * category that already uses a seed name (e.g. a custom "Gift") is left alone instead of duplicated.
 */

import { eq } from 'drizzle-orm';

import { appSettings, categories } from './schema';
import { seedDatabase } from './seed';
import { ICON_REFRESH_V3, SEEDED_VERSION_KEY } from './seed-data';
import { createMemoryDb } from './test-support/memory-db';

let mockMem: ReturnType<typeof createMemoryDb>;
let mockCounter = 0;
jest.mock('./client', () => ({
  get db() {
    return mockMem.db;
  },
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => `id-${++mockCounter}` }));

beforeEach(() => {
  mockMem = createMemoryDb();
});

const all = () => mockMem.db.select().from(categories).all();

describe('seedDatabase (CR-28)', () => {
  it('seeds 10 expense + 7 income categories on a fresh install', () => {
    seedDatabase();
    expect(all()).toHaveLength(17);
    expect(all().filter((c) => c.appliesTo === 'income')).toHaveLength(7);
  });

  it('adds only the income categories on an upgrade from seed version 1, keeping existing rows as they are', () => {
    seedDatabase();
    // pretend this is a v1 install: no income rows yet, the user renamed Food, seed version = 1
    mockMem.db.delete(categories).where(eq(categories.appliesTo, 'income')).run();
    mockMem.db.update(categories).set({ name: 'Eating out' }).where(eq(categories.key, 'food')).run();
    mockMem.db
      .update(appSettings)
      .set({ value: '1' })
      .where(eq(appSettings.key, SEEDED_VERSION_KEY))
      .run();

    seedDatabase();

    expect(all()).toHaveLength(17);
    expect(all().find((c) => c.key === 'food')?.name).toBe('Eating out'); // user's rename kept
    expect(all().find((c) => c.key === 'pocket_money')).toMatchObject({ name: 'Pocket money', appliesTo: 'income' });
  });

  it('does not duplicate a name the user already took with a custom category', () => {
    mockMem.db
      .insert(categories)
      .values({ id: 'mine', key: null, name: 'gift', icon: 'tag', kind: 'custom', appliesTo: 'expense', isProtected: false, order: 50 })
      .run();
    seedDatabase();
    expect(all().filter((c) => c.name.toLowerCase() === 'gift')).toHaveLength(1);
    expect(all().find((c) => c.key === 'gift')).toBeUndefined();
    expect(all()).toHaveLength(17); // 16 seeds (Gift skipped) + the user's own row
  });

  describe('upgrade from seed version 1 (CR-29)', () => {
    /** A v1 install: expense defaults only, seed version 1. */
    function v1Install() {
      seedDatabase();
      mockMem.db.delete(categories).where(eq(categories.appliesTo, 'income')).run();
      mockMem.db.update(appSettings).set({ value: '1' }).where(eq(appSettings.key, SEEDED_VERSION_KEY)).run();
    }

    it('does NOT bring back an expense default the user deleted (e.g. unticked in onboarding)', () => {
      v1Install();
      mockMem.db.delete(categories).where(eq(categories.key, 'education')).run();
      seedDatabase();
      expect(all().find((c) => c.key === 'education')).toBeUndefined();
      expect(all().filter((c) => c.appliesTo === 'income')).toHaveLength(7); // the new ones still arrive
    });

    it('still restores a missing protected row (the app relies on Uncategorized / Other)', () => {
      v1Install();
      mockMem.db.delete(categories).where(eq(categories.key, 'other')).run();
      seedDatabase();
      expect(all().find((c) => c.key === 'other')).toBeDefined();
    });

    it('places the new income categories after every existing category, in their designed order', () => {
      v1Install();
      mockMem.db
        .insert(categories)
        .values({ id: 'mine', key: null, name: 'Fuel', icon: 'tag', kind: 'custom', appliesTo: 'expense', isProtected: false, order: 10 })
        .run();
      seedDatabase();
      const ordered = [...all()].sort((a, b) => a.order - b.order).map((c) => c.name);
      expect(ordered.slice(-8)).toEqual(['Fuel', 'Salary', 'Freelance', 'Interest', 'Refund', 'Gift', 'Pocket money', 'Other income']);
      expect(new Set(all().map((c) => c.order)).size).toBe(all().length); // no two categories share a position
    });

    it('is a no-op once seeded to the current version', () => {
      v1Install();
      seedDatabase();
      mockMem.db.delete(categories).where(eq(categories.key, 'salary')).run();
      seedDatabase();
      expect(all().find((c) => c.key === 'salary')).toBeUndefined();
    });
  });

  describe('upgrade from seed version 2 — clearer income icons (CR-31)', () => {
    /** A v2 install: the income rows exist with the old generic icons, seed version 2. */
    function v2Install() {
      seedDatabase();
      for (const { key, from } of ICON_REFRESH_V3) {
        mockMem.db.update(categories).set({ icon: from }).where(eq(categories.key, key)).run();
      }
      mockMem.db.update(appSettings).set({ value: '2' }).where(eq(appSettings.key, SEEDED_VERSION_KEY)).run();
    }
    const iconOf = (key: string) => all().find((c) => c.key === key)?.icon;

    it('swaps every old default income icon for the new one', () => {
      v2Install();
      seedDatabase();
      for (const { key, to } of ICON_REFRESH_V3) expect(iconOf(key)).toBe(to);
      expect(iconOf('gift')).toBe('gift'); // unchanged one stays
    });

    it('keeps an icon the user picked themselves', () => {
      v2Install();
      mockMem.db.update(categories).set({ icon: 'tag' }).where(eq(categories.key, 'salary')).run();
      seedDatabase();
      expect(iconOf('salary')).toBe('tag');
      expect(iconOf('pocket_money')).toBe('hand-coins');
    });

    it('a fresh install gets the new icons directly', () => {
      seedDatabase();
      expect(iconOf('pocket_money')).toBe('hand-coins');
      expect(iconOf('salary')).toBe('badge-indian-rupee');
    });
  });
});
