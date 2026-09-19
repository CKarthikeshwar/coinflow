import { nameMatches, suggestSettlement } from './suggest-settlement';

const cands = [
  { id: 'amit-dinner', personName: 'Amit Shah', remainingMinor: 30_000 },
  { id: 'amit-cab', personName: 'Amit Shah', remainingMinor: 40_000 },
  { id: 'priya-dinner', personName: 'Priya Nair', remainingMinor: 20_000 },
];

describe('nameMatches', () => {
  it('matches a meaningful word of the name inside the account text', () => {
    expect(nameMatches('AMIT SHAH', 'Amit Shah')).toBe(true);
    expect(nameMatches('amit.shah@okhdfc', 'Amit Shah')).toBe(true);
    expect(nameMatches('UPI/priya n/ref 123456', 'Priya Nair')).toBe(true);
  });

  it('does not match unrelated accounts, empty accounts, or generic words', () => {
    expect(nameMatches('Swiggy', 'Amit Shah')).toBe(false);
    expect(nameMatches('', 'Amit Shah')).toBe(false);
    expect(nameMatches(null, 'Amit Shah')).toBe(false);
    expect(nameMatches('UPI', 'UPI Mr')).toBe(false);
  });
});

describe('suggestSettlement (IMP-085)', () => {
  it('picks the single exact-amount candidate when the payer name matches', () => {
    const r = suggestSettlement({ amountMinor: 30_000, account: 'AMIT SHAH' }, cands);
    expect(r.bestId).toBe('amit-dinner');
    expect(r.orderedIds[0]).toBe('amit-dinner');
  });

  it('picks the single exact-amount candidate when the transaction has no account at all', () => {
    expect(suggestSettlement({ amountMinor: 20_000 }, cands).bestId).toBe('priya-dinner');
    expect(suggestSettlement({ amountMinor: 20_000, account: '' }, cands).bestId).toBe('priya-dinner');
  });

  it('refuses to guess when the amount matches but the payer name does not', () => {
    const r = suggestSettlement({ amountMinor: 30_000, account: 'Swiggy' }, cands);
    expect(r.bestId).toBeNull();
    expect(r.orderedIds[0]).toBe('amit-dinner'); // still ranked first, just not "suggested"
  });

  it('refuses to guess when two candidates share the exact amount', () => {
    const twins = [
      { id: 'a', personName: 'Amit Shah', remainingMinor: 30_000 },
      { id: 'b', personName: 'Amit Shah', remainingMinor: 30_000 },
    ];
    expect(suggestSettlement({ amountMinor: 30_000, account: 'AMIT SHAH' }, twins).bestId).toBeNull();
  });

  it('has no best when nothing matches exactly, and orders by closeness to the amount', () => {
    const r = suggestSettlement({ amountMinor: 35_000 }, cands);
    expect(r.bestId).toBeNull();
    expect(r.orderedIds).toEqual(['amit-cab', 'amit-dinner', 'priya-dinner']); // 5k and 5k tie (same name → by id), then 15k
  });

  it('is stable: ties break by name then id', () => {
    const r = suggestSettlement({ amountMinor: 35_000 }, cands);
    expect(r.orderedIds.slice(0, 2)).toEqual(['amit-cab', 'amit-dinner'].sort());
  });

  it('handles no candidates', () => {
    expect(suggestSettlement({ amountMinor: 100 }, [])).toEqual({ orderedIds: [], bestId: null });
  });

  it('is pure — does not mutate its input', () => {
    const copy = JSON.parse(JSON.stringify(cands));
    suggestSettlement({ amountMinor: 30_000, account: 'AMIT SHAH' }, cands);
    expect(cands).toEqual(copy);
  });
});
