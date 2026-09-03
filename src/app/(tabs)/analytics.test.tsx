import { fireEvent, render } from '@testing-library/react-native';

import type { Category, Transaction } from '@/db/schema';
import { monthPeriod, type Period } from '@/domain/period';

import AnalyticsScreen from './analytics';

const mockOpenSheet = jest.fn();
const mockGetSetting = jest.fn();
const mockSetMode = jest.fn();
const mockStep = jest.fn();

let mockPeriod: Period;
let mockSummary: { spentMinor: number; incomeMinor: number; error: Error | undefined; updatedAt: number | undefined };
let mockBreakdown: { rows: unknown[]; error: Error | undefined; updatedAt: number | undefined };
let mockDaily: {
  series: unknown[];
  yMax: number;
  mean: number;
  median: number;
  previousMean: number | null;
  previousMedian: number | null;
  error: Error | undefined;
  updatedAt: number | undefined;
};
let mockLargest: { rows: Transaction[]; error: Error | undefined; updatedAt: number | undefined };

jest.mock('expo-router/js-tabs', () => ({ useBottomTabBarHeight: () => 0 }));
jest.mock('@/stores', () => ({ useSheetRegistry: (selector: (s: unknown) => unknown) => selector({ open: mockOpenSheet }) }));
jest.mock('@/stores/analytics-period', () => ({
  useAnalyticsPeriod: () => ({ period: mockPeriod, setMode: mockSetMode, step: mockStep }),
}));
jest.mock('@/db/repositories/categories', () => ({ getCategoryMap: () => new Map<string, Category>() }));
jest.mock('@/db/repositories/settings', () => ({ getSetting: (...args: unknown[]) => mockGetSetting(...args) }));
jest.mock('@/db/repositories/analytics', () => ({
  usePeriodSummary: () => mockSummary,
  useCategoryBreakdown: () => mockBreakdown,
  useDailySeries: () => mockDaily,
  useLargestExpenses: () => mockLargest,
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

jest.mock('@/features/analytics/period-control', () => ({
  PeriodControl: (p: { period: Period }) => mockTextStub('PeriodControl')({ label: p.period.label }),
}));
jest.mock('@/features/analytics/balance-arc-card', () => ({
  BalanceArcCard: mockTextStub('BalanceArcCard'),
}));
jest.mock('@/features/analytics/mean-median-tile', () => ({
  MeanMedianTile: (p: { label: string; valueMinor: number }) => mockTextStub(`MeanMedianTile:${p.label}`)({ valueMinor: p.valueMinor }),
}));
jest.mock('@/features/analytics/category-breakdown', () => ({
  CategoryBreakdown: (p: { rows: unknown[] }) => mockTextStub('CategoryBreakdown')({ length: p.rows.length }),
}));
jest.mock('@/features/analytics/daily-chart', () => ({
  DailyChart: (p: { mean: number }) => mockTextStub('DailyChart')({ mean: p.mean }),
}));
jest.mock('@/features/analytics/biggest-expenses', () => ({
  BiggestExpenses: (p: { rows: unknown[] }) => mockTextStub('BiggestExpenses')({ length: p.rows.length }),
}));

beforeEach(() => {
  mockOpenSheet.mockReset();
  mockGetSetting.mockReset().mockReturnValue('month');
  mockSetMode.mockReset();
  mockStep.mockReset();
  mockPeriod = monthPeriod(new Date(2026, 8, 15).getTime());
  mockSummary = { spentMinor: 0, incomeMinor: 0, error: undefined, updatedAt: undefined };
  mockBreakdown = { rows: [], error: undefined, updatedAt: undefined };
  mockDaily = {
    series: [],
    yMax: 1,
    mean: 0,
    median: 0,
    previousMean: null,
    previousMedian: null,
    error: undefined,
    updatedAt: undefined,
  };
  mockLargest = { rows: [], error: undefined, updatedAt: undefined };
});

function markLoaded(overrides: { spentMinor?: number; incomeMinor?: number } = {}) {
  const now = Date.now();
  mockSummary = { spentMinor: overrides.spentMinor ?? 45000, incomeMinor: overrides.incomeMinor ?? 100000, error: undefined, updatedAt: now };
  mockBreakdown = { rows: [{ categoryId: null, amountMinor: 45000, n: 1 }], error: undefined, updatedAt: now };
  mockDaily = {
    series: [{ dayStartMs: now, amountMinor: 45000 }],
    yMax: 45000,
    mean: 4500,
    median: 4500,
    previousMean: 3000,
    previousMedian: 3000,
    error: undefined,
    updatedAt: now,
  };
  mockLargest = { rows: [], error: undefined, updatedAt: now };
}

it('hydrates the persisted analytics-period mode once on mount', async () => {
  mockGetSetting.mockReturnValue('week');
  await render(<AnalyticsScreen />);
  expect(mockGetSetting).toHaveBeenCalledWith('analyticsPeriodMode', 'month');
  expect(mockSetMode).toHaveBeenCalledWith('week', false);
});

it('shows the loading skeleton while any hook has not resolved', async () => {
  const { queryByText } = await render(<AnalyticsScreen />);
  expect(queryByText(/BalanceArcCard/)).toBeNull();
  expect(queryByText(/CategoryBreakdown/)).toBeNull();
});

it('shows an error state and Try again when a hook errors', async () => {
  mockSummary = { ...mockSummary, error: new Error('boom'), updatedAt: Date.now() };
  const { getByText } = await render(<AnalyticsScreen />);
  expect(getByText("Couldn't load your analytics.")).toBeTruthy();
  expect(getByText('Try again')).toBeTruthy();
});

it('shows the empty-period state with an Add transaction CTA when nothing was recorded', async () => {
  markLoaded({ spentMinor: 0, incomeMinor: 0 });
  const { getByText } = await render(<AnalyticsScreen />);
  expect(getByText(`Nothing recorded for ${mockPeriod.label}`)).toBeTruthy();
  await fireEvent.press(getByText('Add transaction'));
  expect(mockOpenSheet).toHaveBeenCalledWith('add', {});
});

it('renders every card with the loaded data once resolved', async () => {
  markLoaded();
  const { getByText } = await render(<AnalyticsScreen />);
  expect(getByText('BalanceArcCard:100000:45000')).toBeTruthy();
  expect(getByText('MeanMedianTile:Mean:4500')).toBeTruthy();
  expect(getByText('MeanMedianTile:Median:4500')).toBeTruthy();
  expect(getByText('CategoryBreakdown:1')).toBeTruthy();
  expect(getByText('DailyChart:4500')).toBeTruthy();
  expect(getByText('BiggestExpenses:0')).toBeTruthy();
});

it('passes the period label through to PeriodControl', async () => {
  markLoaded();
  const { getByText } = await render(<AnalyticsScreen />);
  expect(getByText(`PeriodControl:${mockPeriod.label}`)).toBeTruthy();
});
