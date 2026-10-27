import { useAnalyticsFilter } from './analytics-filter';

beforeEach(() => useAnalyticsFilter.getState().reset());

it('starts empty: all accounts, nothing hidden', () => {
  const s = useAnalyticsFilter.getState();
  expect(s.accountIds).toEqual([]);
  expect(s.hiddenExpense).toEqual([]);
  expect(s.hiddenIncome).toEqual([]);
});

it('toggleHidden flips one id, per side, independently', () => {
  const s = useAnalyticsFilter.getState();
  s.toggleHidden('expense', 'cat-food');
  s.toggleHidden('income', 'cat-salary');
  expect(useAnalyticsFilter.getState().hiddenExpense).toEqual(['cat-food']);
  expect(useAnalyticsFilter.getState().hiddenIncome).toEqual(['cat-salary']);
  s.toggleHidden('expense', 'cat-food');
  expect(useAnalyticsFilter.getState().hiddenExpense).toEqual([]);
  expect(useAnalyticsFilter.getState().hiddenIncome).toEqual(['cat-salary']);
});

it('showAll clears one side, or both', () => {
  const s = useAnalyticsFilter.getState();
  s.setHidden('expense', ['a']);
  s.setHidden('income', ['b']);
  s.showAll('expense');
  expect(useAnalyticsFilter.getState().hiddenExpense).toEqual([]);
  expect(useAnalyticsFilter.getState().hiddenIncome).toEqual(['b']);
  s.showAll();
  expect(useAnalyticsFilter.getState().hiddenIncome).toEqual([]);
});

it('reset clears the accounts too', () => {
  const s = useAnalyticsFilter.getState();
  s.setAccounts(['a1']);
  s.setHidden('expense', ['x']);
  s.reset();
  expect(useAnalyticsFilter.getState().accountIds).toEqual([]);
  expect(useAnalyticsFilter.getState().hiddenExpense).toEqual([]);
});

it('is in memory only — nothing is written anywhere (filters must not survive closing the app)', () => {
  // The store is plain zustand with no `persist` middleware; a fresh module instance starts empty.
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fresh = require('./analytics-filter').useAnalyticsFilter;
    expect(fresh.getState().accountIds).toEqual([]);
  });
});
