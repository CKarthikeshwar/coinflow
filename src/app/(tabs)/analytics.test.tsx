import { fireEvent, render } from '@testing-library/react-native';

import type { Category, Transaction } from '@/db/schema';
import { monthPeriod, isoWeekPeriod, type Period } from '@/domain/period';
import { useAnalyticsFilter } from '@/stores/analytics-filter';

import AnalyticsScreen from './analytics';

const mockOpenSheet = jest.fn();
const mockGetSetting = jest.fn();
const mockSetMode = jest.fn();
const mockStep = jest.fn();

type Loaded<T> = T & { error: Error | undefined; updatedAt: number | undefined };

let mockPeriod: Period;
let mockSummary: Loaded<{ spentMinor: number; incomeMinor: number }>;
let mockIncomeRows: unknown[] = [];
let mockBreakdown: Loaded<{ rows: unknown[] }>;
let mockDaily: Loaded<{
  series: unknown[];
  yMax: number;
  mean: number;
  median: number;
  previousMean: number | null;
  previousMedian: number | null;
}>;
let mockLargest: Loaded<{ rows: Transaction[] }>;
let mockAccountTotals: Loaded<{ rows: unknown[] }>;
let mockMonthly: Loaded<{ series: unknown[] }>;
let mockAccounts: { id: string; nickname: string }[];

jest.mock('expo-router/js-tabs', () => ({ useBottomTabBarHeight: () => 0 }));
jest.mock('@/stores', () => ({ useSheetRegistry: (selector: (s: unknown) => unknown) => selector({ open: mockOpenSheet }) }));
jest.mock('@/stores/analytics-period', () => ({
  useAnalyticsPeriod: () => ({ period: mockPeriod, setMode: mockSetMode, step: mockStep }),
}));
jest.mock('@/db/repositories/categories', () => ({ getCategoryMap: () => new Map<string, Category>() }));
jest.mock('@/db/repositories/settings', () => ({ getSetting: (...args: unknown[]) => mockGetSetting(...args) }));
jest.mock('@/db/repositories/accounts', () => ({ useAccounts: () => ({ data: mockAccounts }) }));
jest.mock('@/db/repositories/analytics', () => ({
  usePeriodSummary: () => mockSummary,
  useCategoryBreakdown: () => mockBreakdown,
  // CR-28 — shares the loaded/error state of the main breakdown; only the rows differ
  useIncomeBreakdown: () => ({ ...mockBreakdown, rows: mockIncomeRows }),
  useDailySeries: () => mockDaily,
  useLargestExpenses: () => mockLargest,
  useAccountTotals: () => mockAccountTotals,
  useMonthlySeries: () => mockMonthly,
}));

// Each child is separately, thoroughly tested in its own file; stubbed here so this screen's
// own test stays focused on which state renders and that the right props reach each child,
// rather than re-asserting chart internals already covered elsewhere. Plain functions (not
// JSX) that `require()` react/react-native internally — a `jest.mock` factory can only
// reference outer identifiers prefixed `mock`, so `Text`/`createElement` can't be imported at
// module scope and closed over the way the JSX form would need.
function mockTextStub(label: string) {
  function Stub(props: Record<string, unknown>) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- see file-header note
    const { createElement } = require('react');
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- see file-header note
    const { Text } = require('react-native');
    return createElement(Text, null, `${label}:${Object.values(props).join(':')}`);
  }
  Stub.displayName = `MockTextStub(${label})`;
  return Stub;
}

// A stub that also exposes pressable handles, so the screen's callbacks can be driven.
function mockActionStub(label: string, describe: (p: never) => string, actions: Record<string, (p: never) => void>) {
  function Stub(props: never) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- see file-header note
    const { createElement } = require('react');
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- see file-header note
    const { Pressable, Text } = require('react-native');
    return createElement(
      Pressable,
      null,
      createElement(Text, null, `${label}:${describe(props)}`),
      ...Object.entries(actions).map(([name, run]) =>
        createElement(Pressable, { key: name, onPress: () => run(props) }, createElement(Text, null, `${label}.${name}`)),
      ),
    );
  }
  Stub.displayName = `MockActionStub(${label})`;
  return Stub;
}

jest.mock('@/features/analytics/period-control', () => ({
  PeriodControl: (p: { period: Period }) => mockTextStub('PeriodControl')({ label: p.period.label }),
}));
jest.mock('@/features/analytics/category-breakdown', () => ({
  CategoryBreakdown: mockActionStub(
    'CategoryBreakdown',
    (p: { kind: string; rows: unknown[]; hiddenIds: string[] }) => `${p.kind}:${p.rows.length}:${p.hiddenIds.join('|')}`,
    {
      toIncome: (p: { onKindChange: (k: string) => void }) => p.onKindChange('income'),
      hideFood: (p: { onToggleHidden: (id: string) => void }) => p.onToggleHidden('cat-food'),
      showAll: (p: { onShowAll: () => void }) => p.onShowAll(),
    },
  ),
}));
jest.mock('@/features/analytics/account-breakdown', () => ({
  AccountBreakdown: mockActionStub('AccountBreakdown', (p: { selectedIds: string[] }) => p.selectedIds.join('|'), {
    pickA: (p: { onSelect: (id: string) => void }) => p.onSelect('a1'),
  }),
}));
jest.mock('@/features/analytics/daily-chart', () => ({
  DailyChart: (p: { mean: number; previousMean: number | null; previousLabel: string; note?: string }) =>
    mockTextStub('DailyChart')({ mean: p.mean, previous: p.previousMean, label: p.previousLabel, note: p.note ?? '' }),
}));
jest.mock('@/features/analytics/income-vs-spending', () => ({
  IncomeVsSpending: (p: { series: unknown[] }) => mockTextStub('IncomeVsSpending')({ length: p.series.length }),
}));
jest.mock('@/features/analytics/biggest-expenses', () => ({
  BiggestExpenses: (p: { rows: unknown[] }) => mockTextStub('BiggestExpenses')({ length: p.rows.length }),
}));

const unresolved = { error: undefined, updatedAt: undefined };

beforeEach(() => {
  mockOpenSheet.mockReset();
  mockGetSetting.mockReset().mockReturnValue('month');
  mockSetMode.mockReset();
  mockStep.mockReset();
  useAnalyticsFilter.getState().reset();
  mockPeriod = monthPeriod(new Date(2026, 8, 15).getTime());
  mockAccounts = [{ id: 'a1', nickname: 'Canara ··672' }];
  mockSummary = { spentMinor: 0, incomeMinor: 0, ...unresolved };
  mockBreakdown = { rows: [], ...unresolved };
  mockIncomeRows = [];
  mockDaily = { series: [], yMax: 1, mean: 0, median: 0, previousMean: null, previousMedian: null, ...unresolved };
  mockLargest = { rows: [], ...unresolved };
  mockAccountTotals = { rows: [], ...unresolved };
  mockMonthly = { series: [], ...unresolved };
});

function markLoaded(overrides: { spentMinor?: number; incomeMinor?: number } = {}) {
  const now = Date.now();
  const ok = { error: undefined, updatedAt: now };
  mockSummary = { spentMinor: overrides.spentMinor ?? 45000, incomeMinor: overrides.incomeMinor ?? 100000, ...ok };
  mockBreakdown = { rows: [{ categoryId: null, amountMinor: 45000, n: 1 }], ...ok };
  mockDaily = {
    series: [{ dayStartMs: now, amountMinor: 45000 }],
    yMax: 45000,
    mean: 4500,
    median: 4500,
    previousMean: 3000,
    previousMedian: 3000,
    ...ok,
  };
  mockLargest = { rows: [], ...ok };
  mockAccountTotals = { rows: [], ...ok };
  mockMonthly = { series: [{}, {}, {}, {}, {}, {}], ...ok };
}

it('hydrates the persisted analytics-period mode once on mount', async () => {
  mockGetSetting.mockReturnValue('week');
  await render(<AnalyticsScreen />);
  expect(mockGetSetting).toHaveBeenCalledWith('analyticsPeriodMode', 'month');
  expect(mockSetMode).toHaveBeenCalledWith('week', false);
});

it('shows the loading skeleton while any hook has not resolved', async () => {
  const { queryByText } = await render(<AnalyticsScreen />);
  expect(queryByText(/DailyChart/)).toBeNull();
  expect(queryByText(/CategoryBreakdown/)).toBeNull();
});

it('shows an error state and Try again when a hook errors', async () => {
  mockSummary = { ...mockSummary, error: new Error('boom'), updatedAt: Date.now() };
  const { getByText } = await render(<AnalyticsScreen />);
  expect(getByText("Couldn't load your analytics.")).toBeTruthy();
  expect(getByText('Try again')).toBeTruthy();
});

it('also errors when one of the new hooks fails', async () => {
  markLoaded();
  mockAccountTotals = { rows: [], error: new Error('boom'), updatedAt: Date.now() };
  const { getByText } = await render(<AnalyticsScreen />);
  expect(getByText("Couldn't load your analytics.")).toBeTruthy();
});

it('shows the empty-period state with an Add transaction CTA when nothing was recorded', async () => {
  markLoaded({ spentMinor: 0, incomeMinor: 0 });
  const { getByText } = await render(<AnalyticsScreen />);
  expect(getByText(`Nothing recorded for ${mockPeriod.label}`)).toBeTruthy();
  await fireEvent.press(getByText('Add transaction'));
  expect(mockOpenSheet).toHaveBeenCalledWith('add', {});
});

it('when the filters leave nothing, says so and Show all clears them (CR-27)', async () => {
  markLoaded({ spentMinor: 0, incomeMinor: 0 });
  useAnalyticsFilter.getState().setHidden('expense', ['cat-food']);
  const { getByText } = await render(<AnalyticsScreen />);
  expect(getByText('Nothing left with these filters')).toBeTruthy();
  await fireEvent.press(getByText('Show all'));
  expect(useAnalyticsFilter.getState().hiddenExpense).toEqual([]);
});

it('renders every card, in order, with the loaded data once resolved', async () => {
  markLoaded();
  const { getByText } = await render(<AnalyticsScreen />);
  expect(getByText('DailyChart:4500:3000:Last month:')).toBeTruthy();
  expect(getByText('CategoryBreakdown:expense:1:')).toBeTruthy();
  expect(getByText('AccountBreakdown:')).toBeTruthy();
  expect(getByText('IncomeVsSpending:6')).toBeTruthy();
  expect(getByText('BiggestExpenses:0')).toBeTruthy();
});

it('passes the period label through to PeriodControl', async () => {
  markLoaded();
  const { getByText } = await render(<AnalyticsScreen />);
  expect(getByText(`PeriodControl:${mockPeriod.label}`)).toBeTruthy();
});

it('leaves Income vs spending out in Week mode and compares against "Last week"', async () => {
  markLoaded();
  mockPeriod = isoWeekPeriod(new Date(2026, 8, 15).getTime());
  const { queryByText, getByText } = await render(<AnalyticsScreen />);
  expect(queryByText(/IncomeVsSpending/)).toBeNull();
  expect(getByText(/DailyChart:4500:3000:Last week/)).toBeTruthy();
});

it('the Spent / Income switch hands the income rows to the Breakdown (CR-27)', async () => {
  markLoaded();
  mockIncomeRows = [
    { categoryId: 'cat-salary', amountMinor: 100000, n: 1 },
    { categoryId: 'cat-gift', amountMinor: 5000, n: 1 },
  ];
  const { getByText } = await render(<AnalyticsScreen />);
  expect(getByText('CategoryBreakdown:expense:1:')).toBeTruthy();
  await fireEvent.press(getByText('CategoryBreakdown.toIncome'));
  expect(getByText('CategoryBreakdown:income:2:')).toBeTruthy();
});

it('the eye hides a category in the store, per side, and Show all brings it back', async () => {
  markLoaded();
  const { getByText } = await render(<AnalyticsScreen />);
  await fireEvent.press(getByText('CategoryBreakdown.hideFood'));
  expect(useAnalyticsFilter.getState().hiddenExpense).toEqual(['cat-food']);
  expect(useAnalyticsFilter.getState().hiddenIncome).toEqual([]);
  expect(getByText('CategoryBreakdown:expense:1:cat-food')).toBeTruthy();
  await fireEvent.press(getByText('CategoryBreakdown.showAll'));
  expect(useAnalyticsFilter.getState().hiddenExpense).toEqual([]);
});

it('the filter chips open the Accounts and Categories sheets', async () => {
  markLoaded();
  const { getByLabelText } = await render(<AnalyticsScreen />);
  await fireEvent.press(getByLabelText('Choose accounts'));
  expect(mockOpenSheet).toHaveBeenCalledWith('analyticsAccounts', {});
  await fireEvent.press(getByLabelText('Choose categories'));
  expect(mockOpenSheet).toHaveBeenCalledWith('analyticsCategories', {});
});

it('shows a banner naming the active filters and Reset clears them', async () => {
  markLoaded();
  useAnalyticsFilter.getState().setAccounts(['a1']);
  useAnalyticsFilter.getState().setHidden('expense', ['cat-food']);
  const { getByText, queryByText, getByLabelText } = await render(<AnalyticsScreen />);
  expect(getByText('Canara ··672 only · 1 category hidden. Every figure below follows this.')).toBeTruthy();
  // the account chip shows the account's name; the categories chip shows the count
  expect(getByText('Canara ··672')).toBeTruthy();
  expect(getByText('Categories · 1 hidden')).toBeTruthy();
  // and the chart's note repeats it
  expect(getByText(/DailyChart:.*Canara ··672 only · 1 category hidden/)).toBeTruthy();
  await fireEvent.press(getByLabelText('Reset filters'));
  expect(useAnalyticsFilter.getState().accountIds).toEqual([]);
  expect(useAnalyticsFilter.getState().hiddenExpense).toEqual([]);
  expect(queryByText(/Every figure below follows this/)).toBeNull();
});

it('tapping an account row filters to it, and tapping it again clears the filter', async () => {
  markLoaded();
  const { getByText } = await render(<AnalyticsScreen />);
  await fireEvent.press(getByText('AccountBreakdown.pickA'));
  expect(useAnalyticsFilter.getState().accountIds).toEqual(['a1']);
  await fireEvent.press(getByText('AccountBreakdown.pickA'));
  expect(useAnalyticsFilter.getState().accountIds).toEqual([]);
});

it('no banner and "All accounts" while nothing is filtered', async () => {
  markLoaded();
  const { getByText, queryByText } = await render(<AnalyticsScreen />);
  expect(getByText('All accounts')).toBeTruthy();
  expect(queryByText(/Every figure below follows this/)).toBeNull();
});
