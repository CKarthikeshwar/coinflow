import { SEED_CATEGORIES } from './seed-data';

describe('SEED_CATEGORIES', () => {
  it('has the system row + 9 defaults (§20.5)', () => {
    expect(SEED_CATEGORIES).toHaveLength(10);
    expect(SEED_CATEGORIES.filter((c) => c.kind === 'system')).toHaveLength(1);
    expect(SEED_CATEGORIES.filter((c) => c.kind === 'default')).toHaveLength(9);
  });

  it('uses unique keys and contiguous order 0..9', () => {
    const keys = SEED_CATEGORIES.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(SEED_CATEGORIES.map((c) => c.order)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('protects only Uncategorized and Other (F6 / §6.11)', () => {
    const protectedKeys = SEED_CATEGORIES.filter((c) => c.isProtected).map((c) => c.key).sort();
    expect(protectedKeys).toEqual(['other', 'uncategorized']);
  });

  it('the system row is Uncategorized at order 0', () => {
    expect(SEED_CATEGORIES[0]).toMatchObject({ key: 'uncategorized', kind: 'system', order: 0 });
  });

  it('every row has a non-empty Lucide icon name', () => {
    for (const c of SEED_CATEGORIES) expect(c.icon).toMatch(/^[a-z-]+$/);
  });
});
