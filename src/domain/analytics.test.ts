import { percentDelta } from './analytics';

describe('percentDelta', () => {
  it('returns null when there is no prior-period figure to compare against', () => {
    expect(percentDelta(500, 0)).toBeNull();
  });

  it('computes a positive change', () => {
    expect(percentDelta(150, 100)).toBeCloseTo(0.5);
  });

  it('computes a negative change', () => {
    expect(percentDelta(50, 100)).toBeCloseTo(-0.5);
  });

  it('is zero when unchanged', () => {
    expect(percentDelta(100, 100)).toBe(0);
  });

  it('handles both current and previous being zero as no change, not "no data"', () => {
    // previous === 0 always short-circuits to null, even if current is also 0 — there's no
    // meaningful percentage of zero, and this matches §26.3's exact guard (`previous === 0`).
    expect(percentDelta(0, 0)).toBeNull();
  });
});
