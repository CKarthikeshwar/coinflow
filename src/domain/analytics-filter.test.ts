import {
  EMPTY_FILTER,
  filterKey,
  filterSignature,
  hiddenCount,
  hiddenFor,
  isFilterActive,
  toggleId,
  UNCATEGORIZED_ID,
} from './analytics-filter';

it('filterKey maps the null category to the uncategorized key', () => {
  expect(filterKey(null)).toBe(UNCATEGORIZED_ID);
  expect(filterKey('cat-food')).toBe('cat-food');
});

it('isFilterActive and hiddenCount', () => {
  expect(isFilterActive(EMPTY_FILTER)).toBe(false);
  expect(isFilterActive({ ...EMPTY_FILTER, accountIds: ['a'] })).toBe(true);
  expect(isFilterActive({ ...EMPTY_FILTER, hiddenIncome: ['x'] })).toBe(true);
  expect(hiddenCount({ accountIds: ['a'], hiddenExpense: ['x', 'y'], hiddenIncome: ['z'] })).toBe(3);
});

it('hiddenFor picks the side', () => {
  const f = { accountIds: [], hiddenExpense: ['e'], hiddenIncome: ['i'] };
  expect(hiddenFor(f, 'expense')).toEqual(['e']);
  expect(hiddenFor(f, 'income')).toEqual(['i']);
});

it('filterSignature differs whenever any part differs (hook deps)', () => {
  const base = filterSignature(EMPTY_FILTER);
  expect(filterSignature({ ...EMPTY_FILTER, accountIds: ['a'] })).not.toBe(base);
  expect(filterSignature({ ...EMPTY_FILTER, hiddenExpense: ['a'] })).not.toBe(base);
  expect(filterSignature({ ...EMPTY_FILTER, hiddenIncome: ['a'] })).not.toBe(filterSignature({ ...EMPTY_FILTER, hiddenExpense: ['a'] }));
});

it('toggleId adds then removes', () => {
  expect(toggleId(['a'], 'b')).toEqual(['a', 'b']);
  expect(toggleId(['a', 'b'], 'a')).toEqual(['b']);
});
