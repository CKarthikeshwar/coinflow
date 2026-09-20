import { buildSplitBadges, splitBadgeLabel } from './split-badge';

const splits = [
  { transactionId: 't1', splitId: 's1', amountMinor: 120_000 },
  { transactionId: 't2', splitId: 's2', amountMinor: 60_000 },
];
const shares = [
  { id: 'a', splitId: 's1', amountMinor: 30_000, waivedAt: null },
  { id: 'b', splitId: 's1', amountMinor: 30_000, waivedAt: null },
  { id: 'c', splitId: 's1', amountMinor: 30_000, waivedAt: null },
  { id: 'd', splitId: 's2', amountMinor: 20_000, waivedAt: 5 },
  { id: 'e', splitId: 's2', amountMinor: 20_000, waivedAt: null },
];

describe('buildSplitBadges (UI-075)', () => {
  it('counts settled shares and derives your part', () => {
    const b = buildSplitBadges(splits, shares, [{ shareId: 'a', amountMinor: 30_000 }, { shareId: 'b', amountMinor: 10_000 }]);
    expect(b.get('t1')).toEqual({ total: 3, paid: 1, yourMinor: 30_000 }); // b is only partly paid
  });

  it('adds up several settlements on one share', () => {
    const b = buildSplitBadges(splits, shares, [{ shareId: 'b', amountMinor: 10_000 }, { shareId: 'b', amountMinor: 20_000 }]);
    expect(b.get('t1')!.paid).toBe(1);
  });

  it('leaves waived shares out of the count, and you absorb them in "your share"', () => {
    const b = buildSplitBadges(splits, shares, []);
    expect(b.get('t2')).toEqual({ total: 1, paid: 0, yourMinor: 40_000 }); // 60k − 20k (only the non-waived share) = 40k
  });

  it('ignores request settlements (share id null) and returns nothing for unsplit transactions', () => {
    const b = buildSplitBadges(splits, shares, [{ shareId: null, amountMinor: 999 }]);
    expect(b.get('t1')!.paid).toBe(0);
    expect(b.has('t3')).toBe(false);
  });

  it('handles no data', () => {
    expect(buildSplitBadges([], [], []).size).toBe(0);
  });
});

describe('splitBadgeLabel', () => {
  it.each([
    [{ total: 3, paid: 1, yourMinor: 0 }, 'Split · 1 of 3 paid'],
    [{ total: 3, paid: 0, yourMinor: 0 }, 'Split · 0 of 3 paid'],
    [{ total: 2, paid: 2, yourMinor: 0 }, 'Split · all paid'],
    [{ total: 0, paid: 0, yourMinor: 0 }, 'Split'],
  ])('%j → %s', (badge, label) => {
    expect(splitBadgeLabel(badge)).toBe(label);
  });
});
