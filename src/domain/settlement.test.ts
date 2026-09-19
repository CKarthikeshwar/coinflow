import { allocate } from './settlement';

describe('allocate (IMP-075)', () => {
  it('settles each pick fully when the payment covers them', () => {
    const r = allocate(45_000, 0, [
      { targetId: 'a', remainingMinor: 30_000 },
      { targetId: 'b', remainingMinor: 15_000 },
    ]);
    expect(r.allocations).toEqual([
      { targetId: 'a', amountMinor: 30_000 },
      { targetId: 'b', amountMinor: 15_000 },
    ]);
    expect(r.unallocatedMinor).toBe(0);
  });

  it('caps a pick by what is left of the transaction, in order', () => {
    const r = allocate(30_000, 0, [
      { targetId: 'a', remainingMinor: 20_000 },
      { targetId: 'b', remainingMinor: 40_000 },
    ]);
    expect(r.allocations).toEqual([
      { targetId: 'a', amountMinor: 20_000 },
      { targetId: 'b', amountMinor: 10_000 },
    ]);
    expect(r.unallocatedMinor).toBe(0);
  });

  it('caps a pick by what the target still owes — the rest stays an ordinary transaction (no leftover flow)', () => {
    const r = allocate(50_000, 0, [{ targetId: 'a', remainingMinor: 30_000 }]);
    expect(r.allocations).toEqual([{ targetId: 'a', amountMinor: 30_000 }]);
    expect(r.unallocatedMinor).toBe(20_000);
  });

  it('honours a smaller requested amount (paying in parts)', () => {
    const r = allocate(50_000, 0, [{ targetId: 'a', remainingMinor: 30_000, requestedMinor: 10_000 }]);
    expect(r.allocations).toEqual([{ targetId: 'a', amountMinor: 10_000 }]);
  });

  it('never allocates more than the target owes even if more is requested', () => {
    const r = allocate(50_000, 0, [{ targetId: 'a', remainingMinor: 30_000, requestedMinor: 99_000 }]);
    expect(r.allocations[0].amountMinor).toBe(30_000);
  });

  it('accounts for earlier settlements of the same transaction', () => {
    const r = allocate(50_000, 45_000, [{ targetId: 'a', remainingMinor: 30_000 }]);
    expect(r.allocations).toEqual([{ targetId: 'a', amountMinor: 5_000 }]);
    expect(r.unallocatedMinor).toBe(0);
  });

  it('drops picks that end up at zero', () => {
    const r = allocate(10_000, 0, [
      { targetId: 'a', remainingMinor: 10_000 },
      { targetId: 'b', remainingMinor: 5_000 },
      { targetId: 'c', remainingMinor: 0 },
    ]);
    expect(r.allocations).toEqual([{ targetId: 'a', amountMinor: 10_000 }]);
  });

  it('total allocated never exceeds the transaction (property)', () => {
    for (let n = 0; n < 200; n++) {
      const txn = (n * 7919) % 100_000;
      const picks = [1, 2, 3, 4].map((k) => ({ targetId: `t${k}`, remainingMinor: ((n + k) * 6271) % 60_000 }));
      const r = allocate(txn, 0, picks);
      expect(r.allocatedMinor + r.unallocatedMinor).toBe(txn);
      expect(r.allocatedMinor).toBeLessThanOrEqual(txn);
    }
  });

  it('rejects duplicates, negatives, fractions and an over-allocated transaction', () => {
    expect(() => allocate(100, 0, [{ targetId: 'a', remainingMinor: 1 }, { targetId: 'a', remainingMinor: 1 }])).toThrow(RangeError);
    expect(() => allocate(100, 0, [{ targetId: 'a', remainingMinor: -1 }])).toThrow(RangeError);
    expect(() => allocate(100.5, 0, [])).toThrow(RangeError);
    expect(() => allocate(100, 200, [])).toThrow(RangeError);
  });
});
