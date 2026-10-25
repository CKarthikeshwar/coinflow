import { SEED_CATEGORIES } from './seed-data';

describe('SEED_CATEGORIES', () => {
  it('has the system row + 9 expense defaults (§20.5) + 7 income defaults (CR-28)', () => {
    expect(SEED_CATEGORIES).toHaveLength(17);
    expect(SEED_CATEGORIES.filter((c) => c.kind === 'system')).toHaveLength(1);
    expect(SEED_CATEGORIES.filter((c) => c.kind === 'default')).toHaveLength(16);
    expect(SEED_CATEGORIES.filter((c) => c.appliesTo === 'income').map((c) => c.name)).toEqual([
      'Salary', 'Freelance', 'Interest', 'Refund', 'Gift', 'Pocket money', 'Other income',
    ]);
    expect(SEED_CATEGORIES.filter((c) => c.appliesTo === 'expense')).toHaveLength(10);
  });

  it('uses unique names, since category names are unique across expense and income (IMP-019)', () => {
    const names = SEED_CATEGORIES.map((c) => c.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });

  it('uses unique keys and contiguous order 0..16', () => {
    const keys = SEED_CATEGORIES.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(SEED_CATEGORIES.map((c) => c.order)).toEqual(Array.from({ length: 17 }, (_, i) => i));
  });

  it('protects only Uncategorized, Other and Other income (F6 / §6.11 / CR-28)', () => {
    const protectedKeys = SEED_CATEGORIES.filter((c) => c.isProtected).map((c) => c.key).sort();
    expect(protectedKeys).toEqual(['other', 'other_income', 'uncategorized']);
  });

  it('the system row is Uncategorized at order 0', () => {
    expect(SEED_CATEGORIES[0]).toMatchObject({ key: 'uncategorized', kind: 'system', order: 0 });
  });

  it('every row has a non-empty Lucide icon name', () => {
    for (const c of SEED_CATEGORIES) expect(c.icon).toMatch(/^[a-z0-9-]+$/);
  });
});
