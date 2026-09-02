import { parseFilterParams } from './filter-params';

describe('parseFilterParams', () => {
  it('returns empty/undefined defaults for no params', () => {
    expect(parseFilterParams({})).toEqual({
      categoryIds: [],
      type: undefined,
      methods: [],
      from: undefined,
      to: undefined,
    });
  });

  it('splits comma-joined categoryIds and methods', () => {
    const parsed = parseFilterParams({ categoryIds: 'cat-1,cat-2', methods: 'upi,cash' });
    expect(parsed.categoryIds).toEqual(['cat-1', 'cat-2']);
    expect(parsed.methods).toEqual(['upi', 'cash']);
  });

  it('treats an empty string as "no filter", not [""]', () => {
    const parsed = parseFilterParams({ categoryIds: '', methods: '', type: '', from: '', to: '' });
    expect(parsed).toEqual({ categoryIds: [], type: undefined, methods: [], from: undefined, to: undefined });
  });

  it('unwraps expo-router array-form params to their first value', () => {
    const parsed = parseFilterParams({ categoryIds: ['cat-1,cat-2'], type: ['income'] });
    expect(parsed.categoryIds).toEqual(['cat-1', 'cat-2']);
    expect(parsed.type).toBe('income');
  });

  it('parses from/to as numbers', () => {
    const parsed = parseFilterParams({ from: '1700000000000', to: '1700100000000' });
    expect(parsed.from).toBe(1_700_000_000_000);
    expect(parsed.to).toBe(1_700_100_000_000);
  });
});
