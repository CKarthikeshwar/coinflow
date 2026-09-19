import {
  effectiveAmount,
  equalShares,
  percentToMinor,
  recomputeYourShare,
  remainingMinor,
  shareRemainingMinor,
  shareState,
  splitState,
  validateSplit,
} from './split';

/** Small deterministic PRNG so the "property" tests are reproducible. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

describe('equalShares (IMP-071)', () => {
  it('splits evenly when it divides exactly', () => {
    expect(equalShares(120_000, 3)).toEqual({ youMinor: 30_000, eachMinor: 30_000 }); // ₹1,200 / 4
  });

  it('gives the leftover paise to you: ₹100 among you + 2', () => {
    expect(equalShares(10_000, 2)).toEqual({ youMinor: 3_334, eachMinor: 3_333 });
  });

  it('you keep everything when the amount is smaller than the head-count', () => {
    expect(equalShares(2, 3)).toEqual({ youMinor: 2, eachMinor: 0 });
  });

  it('always satisfies you + n×each = total (property)', () => {
    const rand = rng(7);
    for (let i = 0; i < 500; i++) {
      const total = Math.floor(rand() * 5_000_000);
      const n = 1 + Math.floor(rand() * 12);
      const { youMinor, eachMinor } = equalShares(total, n);
      expect(youMinor + eachMinor * n).toBe(total);
      expect(youMinor).toBeGreaterThanOrEqual(eachMinor);
      expect(youMinor - eachMinor).toBeLessThanOrEqual(n); // remainder < head-count
    }
  });

  it('rejects nonsense input', () => {
    expect(() => equalShares(-1, 2)).toThrow(RangeError);
    expect(() => equalShares(10.5, 2)).toThrow(RangeError);
    expect(() => equalShares(100, 0)).toThrow(RangeError);
  });
});

describe('percentToMinor (IMP-072)', () => {
  it('maps clean percentages exactly', () => {
    expect(percentToMinor(120_000, [25, 25, 25, 25])).toEqual([30_000, 30_000, 30_000, 30_000]);
    expect(percentToMinor(10_000, [50, 30, 20])).toEqual([5_000, 3_000, 2_000]);
  });

  it('largest remainder: 33.34 / 33.33 / 33.33 of ₹1 sums to exactly 100 paise', () => {
    const out = percentToMinor(100, [33.34, 33.33, 33.33]);
    expect(out.reduce((a, b) => a + b, 0)).toBe(100);
    expect(out).toEqual([34, 33, 33]);
  });

  it('breaks ties toward you (index 0): 1 paise among three equal 33.33…%', () => {
    expect(percentToMinor(1, [100 / 3, 100 / 3, 100 / 3])).toEqual([1, 0, 0]);
  });

  it('always sums to the total (property)', () => {
    const rand = rng(99);
    for (let i = 0; i < 500; i++) {
      const total = Math.floor(rand() * 9_000_000);
      const n = 2 + Math.floor(rand() * 7);
      // random hundredths that sum to exactly 10 000
      const cuts = Array.from({ length: n - 1 }, () => Math.floor(rand() * 10_001)).sort((a, b) => a - b);
      const parts = [cuts[0], ...cuts.slice(1).map((c, k) => c - cuts[k]), 10_000 - cuts[n - 2]];
      const percents = parts.map((p) => p / 100);
      const out = percentToMinor(total, percents);
      expect(out).toHaveLength(n);
      expect(out.reduce((a, b) => a + b, 0)).toBe(total);
      out.forEach((v) => expect(Number.isInteger(v) && v >= 0).toBe(true));
    }
  });

  it('rejects percentages that do not sum to 100, or are negative', () => {
    expect(() => percentToMinor(100, [50, 40])).toThrow(RangeError);
    expect(() => percentToMinor(100, [120, -20])).toThrow(RangeError);
    expect(() => percentToMinor(100, [])).toThrow(RangeError);
  });
});

describe('validateSplit (IMP-070)', () => {
  it('derives your share as amount − Σ shares', () => {
    expect(validateSplit(120_000, [30_000, 30_000, 30_000])).toEqual({ ok: true, yourMinor: 30_000 });
  });

  it('allows your share to be exactly ₹0 (someone covers you entirely)', () => {
    expect(validateSplit(60_000, [30_000, 30_000])).toEqual({ ok: true, yourMinor: 0 });
  });

  it('rejects shares that exceed the total', () => {
    expect(validateSplit(60_000, [40_000, 30_000])).toEqual({ ok: false, yourMinor: -10_000, reason: 'over_total' });
  });

  it('rejects a split with no shares, and zero / negative / fractional shares', () => {
    expect(validateSplit(100, [])).toMatchObject({ ok: false, reason: 'no_shares' });
    expect(validateSplit(100, [0])).toMatchObject({ ok: false, reason: 'bad_share' });
    expect(validateSplit(100, [-5, 10])).toMatchObject({ ok: false, reason: 'bad_share' });
    expect(validateSplit(100, [10.5])).toMatchObject({ ok: false, reason: 'bad_share' });
  });
});

describe('remainingMinor', () => {
  it('is 0 when balanced, positive when short, negative when over', () => {
    expect(remainingMinor(1_200, 300, [300, 300, 300])).toBe(0);
    expect(remainingMinor(1_200, 300, [300, 300])).toBe(300);
    expect(remainingMinor(1_200, 400, [300, 300, 300])).toBe(-100);
  });
});

describe('effectiveAmount (IMP-073 / IMP-074)', () => {
  const debit = { direction: 'debit' as const, amountMinor: 120_000 };

  it('a debit with no split is its full amount (V1 behaviour)', () => {
    expect(effectiveAmount(debit, [], 0)).toBe(120_000);
  });

  it('a debit counts only your share: amount − Σ non-waived shares', () => {
    const shares = [{ amountMinor: 30_000 }, { amountMinor: 30_000 }, { amountMinor: 30_000 }];
    expect(effectiveAmount(debit, shares, 0)).toBe(30_000);
  });

  it('a waived share is absorbed by you', () => {
    const shares = [{ amountMinor: 30_000 }, { amountMinor: 30_000, waivedAt: 5 }, { amountMinor: 30_000 }];
    expect(effectiveAmount(debit, shares, 0)).toBe(60_000);
  });

  it('settling a share never changes what you spent (receivable is not spending)', () => {
    const shares = [{ amountMinor: 30_000 }];
    expect(effectiveAmount(debit, shares, 30_000)).toBe(effectiveAmount(debit, shares, 0));
  });

  it('a credit that settled shares only counts its unused part as income', () => {
    const credit = { direction: 'credit' as const, amountMinor: 50_000 };
    expect(effectiveAmount(credit, [], 0)).toBe(50_000);
    expect(effectiveAmount(credit, [], 45_000)).toBe(5_000);
    expect(effectiveAmount(credit, [], 50_000)).toBe(0);
  });

  it('never goes negative', () => {
    expect(effectiveAmount(debit, [{ amountMinor: 999_999 }], 0)).toBe(0);
    expect(effectiveAmount({ direction: 'credit', amountMinor: 10 }, [], 99)).toBe(0);
  });
});

describe('shareState / splitState / shareRemainingMinor (IMP-076)', () => {
  const share = { amountMinor: 30_000 };

  it('classifies pending → partial → settled by how much is settled', () => {
    expect(shareState(share, 0)).toBe('pending');
    expect(shareState(share, 10_000)).toBe('partial');
    expect(shareState(share, 30_000)).toBe('settled');
    expect(shareState(share, 40_000)).toBe('settled'); // overpaid is still settled
  });

  it('waived wins over everything', () => {
    expect(shareState({ ...share, waivedAt: 1 }, 0)).toBe('waived');
    expect(shareState({ ...share, waivedAt: 1 }, 30_000)).toBe('waived');
  });

  it('a split is open while any share is pending or partial, settled otherwise', () => {
    expect(splitState(['settled', 'partial'])).toBe('open');
    expect(splitState(['settled', 'pending'])).toBe('open');
    expect(splitState(['settled', 'waived'])).toBe('settled');
    expect(splitState([])).toBe('settled');
  });

  it('remaining is what is still owed, 0 when settled or waived', () => {
    expect(shareRemainingMinor(share, 10_000)).toBe(20_000);
    expect(shareRemainingMinor(share, 30_000)).toBe(0);
    expect(shareRemainingMinor({ ...share, waivedAt: 1 }, 0)).toBe(0);
  });
});

describe('recomputeYourShare (IMP-089)', () => {
  it('keeps others’ shares and recomputes yours', () => {
    expect(recomputeYourShare(150_000, [30_000, 30_000, 30_000])).toEqual({ ok: true, yourMinor: 60_000 });
  });

  it('is blocked when yours would go negative', () => {
    expect(recomputeYourShare(80_000, [30_000, 30_000, 30_000])).toEqual({ ok: false, yourMinor: -10_000 });
  });

  it('allows exactly zero', () => {
    expect(recomputeYourShare(90_000, [30_000, 30_000, 30_000])).toEqual({ ok: true, yourMinor: 0 });
  });
});
