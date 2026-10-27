import { fireEvent, render } from '@testing-library/react-native';

import type { Category } from '@/db/schema';
import { useAnalyticsFilter } from '@/stores/analytics-filter';

import { AnalyticsCategoriesSheet } from './categories-sheet';

const mockClose = jest.fn();
const mockSpentFilter = jest.fn();

function mockCat(id: string, name: string, key: string, order: number): Category {
  return { id, key, name, icon: 'x', kind: 'default', appliesTo: 'expense', isProtected: false, order, createdAt: 0, updatedAt: 0 } as Category;
}

jest.mock('@/stores', () => ({ useSheetRegistry: (selector: (s: unknown) => unknown) => selector({ close: mockClose }) }));
jest.mock('@/stores/analytics-period', () => ({
  useAnalyticsPeriod: (selector: (s: unknown) => unknown) => // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can only close over mock*
    selector({ period: require('@/domain/period').monthPeriod(new Date(2026, 8, 15).getTime()) }),
}));
jest.mock('@/db/repositories/categories', () => ({
  getCategoryMap: () =>
    new Map([
      ['c-food', mockCat('c-food', 'Food', 'food', 1)],
      ['c-bills', mockCat('c-bills', 'Bills', 'bills', 2)],
      ['c-salary', mockCat('c-salary', 'Salary', 'other', 3)],
    ]),
}));
jest.mock('@/db/repositories/analytics', () => ({
  useCategoryBreakdown: (...args: unknown[]) => {
    mockSpentFilter(...args);
    return {
      rows: [
        { categoryId: 'c-food', amountMinor: 75000, n: 3 },
        { categoryId: 'c-bills', amountMinor: 25000, n: 1 },
        { categoryId: null, amountMinor: 1000, n: 1 },
      ],
    };
  },
  useIncomeBreakdown: () => ({ rows: [{ categoryId: 'c-salary', amountMinor: 900000, n: 1 }] }),
}));

beforeEach(() => {
  mockClose.mockReset();
  mockSpentFilter.mockReset();
  useAnalyticsFilter.getState().reset();
});

it('lists the spending categories with amount and share, Uncategorized included, all ticked by default', async () => {
  const { getByText, getByLabelText } = await render(<AnalyticsCategoriesSheet />);
  expect(getByText('Food')).toBeTruthy();
  expect(getByText('₹750 · 74%')).toBeTruthy();
  expect(getByText('Uncategorized')).toBeTruthy();
  expect(getByLabelText('Food').props.accessibilityState.checked).toBe(true);
});

it('asks for the list with the chosen accounts and nothing hidden, so hidden rows stay listed', async () => {
  useAnalyticsFilter.getState().setAccounts(['a-bank']);
  useAnalyticsFilter.getState().setHidden('expense', ['c-food']);
  await render(<AnalyticsCategoriesSheet />);
  const filter = mockSpentFilter.mock.calls[0][1];
  expect(filter).toEqual({ accountIds: ['a-bank'], hiddenExpense: [], hiddenIncome: [] });
});

it('unticking and Apply hides that category and closes', async () => {
  const { getByLabelText, getByText } = await render(<AnalyticsCategoriesSheet />);
  await fireEvent.press(getByLabelText('Food'));
  expect(getByText('Apply · 1 hidden')).toBeTruthy();
  expect(useAnalyticsFilter.getState().hiddenExpense).toEqual([]); // nothing written yet
  await fireEvent.press(getByText('Apply · 1 hidden'));
  expect(useAnalyticsFilter.getState().hiddenExpense).toEqual(['c-food']);
  expect(mockClose).toHaveBeenCalled();
});

it('Only keeps just that one by hiding every other row on this side', async () => {
  const { getByLabelText, getByText } = await render(<AnalyticsCategoriesSheet />);
  await fireEvent.press(getByLabelText('Only Bills'));
  await fireEvent.press(getByText(/^Apply/));
  expect(useAnalyticsFilter.getState().hiddenExpense.sort()).toEqual(['c-food', 'uncategorized']);
});

it('the Income tab has its own list and hides independently of spending', async () => {
  const { getByText, getByLabelText } = await render(<AnalyticsCategoriesSheet />);
  await fireEvent.press(getByText('Income'));
  expect(getByText('Salary')).toBeTruthy();
  await fireEvent.press(getByLabelText('Salary'));
  await fireEvent.press(getByText(/^Apply/));
  expect(useAnalyticsFilter.getState().hiddenIncome).toEqual(['c-salary']);
  expect(useAnalyticsFilter.getState().hiddenExpense).toEqual([]);
});

it('opens with the current hidden categories unticked, and Reset shows everything', async () => {
  useAnalyticsFilter.getState().setHidden('expense', ['c-food']);
  const { getByLabelText, getByText } = await render(<AnalyticsCategoriesSheet />);
  expect(getByLabelText('Food').props.accessibilityState.checked).toBe(false);
  await fireEvent.press(getByText('Reset'));
  expect(getByLabelText('Food').props.accessibilityState.checked).toBe(true);
  await fireEvent.press(getByText('Apply'));
  expect(useAnalyticsFilter.getState().hiddenExpense).toEqual([]);
});
