import {
  YOU_KEY,
  computeSplitDraft,
  minorToRupeeText,
  parsePercent,
  parseRupeesToMinor,
  percentText,
} from './split-draft';

const amounts = (r: ReturnType<typeof computeSplitDraft>) => r.rows.map((x) => x.amountMinor);

describe('computeSplitDraft — ₹ mode (UI-072)', () => {
  it('defaults to an equal split including you (the design’s ₹1,200 among four)', () => {
    const r = computeSplitDraft({ totalMinor: 120_000, personKeys: ['a', 'b', 'c'], mode: 'rupee', overrides: {} });
    expect(amounts(r)).toEqual([30_000, 30_000, 30_000, 30_000]);
    expect(r.youMinor).toBe(30_000);
    expect(r.balanced).toBe(true);
    expect(r.canSave).toBe(true);
    expect(r.rows.every((x) => !x.custom)).toBe(true);
  });

  it('gives the leftover paise to You when you are free', () => {
    const r = computeSplitDraft({ totalMinor: 10_000, personKeys: ['a', 'b'], mode: 'rupee', overrides: {} });
    expect(amounts(r)).toEqual([3_334, 3_333, 3_333]);
    expect(r.remainingMinor).toBe(0);
  });

  it('a custom row is fixed and the rest re-share what is left equally', () => {
    const r = computeSplitDraft({ totalMinor: 120_000, personKeys: ['a', 'b', 'c'], mode: 'rupee', overrides: { a: 60_000 } });
    expect(amounts(r)).toEqual([20_000, 60_000, 20_000, 20_000]); // you, a(custom), b, c
    expect(r.rows[1].custom).toBe(true);
    expect(r.balanced).toBe(true);
  });

  it('custom edits on You work too, and leftover then goes to the first free person', () => {
    const r = computeSplitDraft({ totalMinor: 10_000, personKeys: ['a', 'b'], mode: 'rupee', overrides: { [YOU_KEY]: 3_334 } });
    expect(amounts(r)).toEqual([3_334, 3_333, 3_333]);
    const r2 = computeSplitDraft({ totalMinor: 10_001, personKeys: ['a', 'b'], mode: 'rupee', overrides: { [YOU_KEY]: 0 } });
    expect(amounts(r2)).toEqual([0, 5_001, 5_000]); // remainder to the first free row (a)
  });

  it('your amount may be ₹0 (someone covers you entirely) and the split can still be saved', () => {
    const r = computeSplitDraft({ totalMinor: 60_000, personKeys: ['a', 'b'], mode: 'rupee', overrides: { [YOU_KEY]: 0 } });
    expect(amounts(r)).toEqual([0, 30_000, 30_000]);
    expect(r.canSave).toBe(true);
  });

  it('shows "remaining" when everything is fixed and short, and "over" when too much — Save disabled', () => {
    const short = computeSplitDraft({
      totalMinor: 100_000, personKeys: ['a'], mode: 'rupee', overrides: { [YOU_KEY]: 30_000, a: 30_000 },
    });
    expect(short.remainingMinor).toBe(40_000);
    expect(short.canSave).toBe(false);
    const over = computeSplitDraft({
      totalMinor: 100_000, personKeys: ['a'], mode: 'rupee', overrides: { [YOU_KEY]: 80_000, a: 40_000 },
    });
    expect(over.remainingMinor).toBe(-20_000);
    expect(over.canSave).toBe(false);
  });

  it('free rows never go negative when the fixed rows already exceed the total', () => {
    const r = computeSplitDraft({ totalMinor: 10_000, personKeys: ['a', 'b'], mode: 'rupee', overrides: { a: 50_000 } });
    expect(r.rows.every((x) => x.amountMinor >= 0)).toBe(true);
    expect(r.remainingMinor).toBeLessThan(0);
    expect(r.canSave).toBe(false);
  });

  it('refuses to save while someone owes ₹0, and reports who', () => {
    const r = computeSplitDraft({ totalMinor: 100, personKeys: ['a', 'b', 'c'], mode: 'rupee', overrides: { b: 0 } });
    expect(r.zeroPeople).toEqual(['b']);
    expect(r.canSave).toBe(false);
  });

  it('cannot save with nobody selected', () => {
    expect(computeSplitDraft({ totalMinor: 100, personKeys: [], mode: 'rupee', overrides: {} }).canSave).toBe(false);
  });

  it('always sums to the total when nothing is overridden (property)', () => {
    for (let total = 0; total < 3_000; total += 37) {
      for (let n = 1; n <= 7; n++) {
        const r = computeSplitDraft({ totalMinor: total, personKeys: Array.from({ length: n }, (_v, i) => `p${i}`), mode: 'rupee', overrides: {} });
        expect(amounts(r).reduce((a, b) => a + b, 0)).toBe(total);
        expect(r.balanced).toBe(true);
      }
    }
  });
});

describe('computeSplitDraft — % mode', () => {
  it('defaults to equal percentages and exact paise', () => {
    const r = computeSplitDraft({ totalMinor: 120_000, personKeys: ['a', 'b', 'c'], mode: 'percent', overrides: {} });
    expect(r.rows.map((x) => x.percent)).toEqual([25, 25, 25, 25]);
    expect(amounts(r)).toEqual([30_000, 30_000, 30_000, 30_000]);
  });

  it('three-way: 33.34 / 33.33 / 33.33 and paise sum exactly (largest remainder)', () => {
    const r = computeSplitDraft({ totalMinor: 100, personKeys: ['a', 'b'], mode: 'percent', overrides: {} });
    expect(r.rows.map((x) => x.percent)).toEqual([33.34, 33.33, 33.33]);
    expect(amounts(r).reduce((a, b) => a + b, 0)).toBe(100);
    expect(r.balanced).toBe(true);
  });

  it('a custom percentage is fixed and the rest re-share the remaining percentage', () => {
    const r = computeSplitDraft({ totalMinor: 100_000, personKeys: ['a', 'b'], mode: 'percent', overrides: { a: 50 } });
    expect(r.rows.map((x) => x.percent)).toEqual([25, 50, 25]);
    expect(amounts(r)).toEqual([25_000, 50_000, 25_000]);
  });

  it('percentages that do not add to 100 leave a remainder and block Save', () => {
    const r = computeSplitDraft({
      totalMinor: 100_000, personKeys: ['a'], mode: 'percent', overrides: { [YOU_KEY]: 30, a: 30 },
    });
    expect(r.remainingMinor).toBe(40_000);
    expect(r.canSave).toBe(false);
  });

  it('percentages over 100 report "over" and block Save', () => {
    const r = computeSplitDraft({
      totalMinor: 100_000, personKeys: ['a'], mode: 'percent', overrides: { [YOU_KEY]: 80, a: 40 },
    });
    expect(r.remainingMinor).toBeLessThan(0);
    expect(r.canSave).toBe(false);
  });
});

describe('field parsing / formatting', () => {
  it.each([
    ['300', 30_000], ['300.5', 30_050], ['300.55', 30_055], ['₹1,200.00', 120_000], ['  45 ', 4_500], ['0', 0], ['.5', 50], ['12.', 1_200],
  ])('parseRupeesToMinor(%p) = %p', (text, paise) => {
    expect(parseRupeesToMinor(text)).toBe(paise);
  });

  it.each([[''], ['.'], ['abc'], ['1.234'], ['-5'], ['1e3']])('parseRupeesToMinor(%p) = null', (text) => {
    expect(parseRupeesToMinor(text)).toBeNull();
  });

  it('parsePercent accepts 0–100 with up to 2 decimals only', () => {
    expect(parsePercent('33.34')).toBe(33.34);
    expect(parsePercent('25%')).toBe(25);
    expect(parsePercent('100')).toBe(100);
    expect(parsePercent('101')).toBeNull();
    expect(parsePercent('1.234')).toBeNull();
    expect(parsePercent('')).toBeNull();
  });

  it('minorToRupeeText / percentText drop pointless decimals', () => {
    expect(minorToRupeeText(30_000)).toBe('300');
    expect(minorToRupeeText(3_334)).toBe('33.34');
    expect(minorToRupeeText(50)).toBe('0.50');
    expect(percentText(25)).toBe('25');
    expect(percentText(33.34)).toBe('33.34');
    expect(percentText(33.3)).toBe('33.3');
  });
});
