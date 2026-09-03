import { fireEvent, render } from '@testing-library/react-native';

import type { Category } from '@/db/schema';
import { monthPeriod } from '@/domain/period';

import { CategoryBreakdown } from './category-breakdown';

const mockRouterPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (...args: unknown[]) => mockRouterPush(...args) } }));

const period = monthPeriod(new Date(2026, 8, 15).getTime());

function category(overrides: Partial<Category> = {}): Category {
  return {
    id: 'cat-food',
    key: 'food',
    name: 'Food',
    icon: 'utensils',
    kind: 'default',
    isProtected: true,
    order: 1,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

beforeEach(() => {
  mockRouterPush.mockReset();
});

it('shows the empty state when there are no rows', async () => {
  const { getByText } = await render(<CategoryBreakdown rows={[]} categoryById={new Map()} period={period} />);
  expect(getByText('Nothing recorded for this period.')).toBeTruthy();
});

it('renders a row per category with its share and amount', async () => {
  const categoryById = new Map([['cat-food', category()]]);
  const { getByText } = await render(
    <CategoryBreakdown rows={[{ categoryId: 'cat-food', amountMinor: 30000, n: 2 }]} categoryById={categoryById} period={period} />,
  );
  expect(getByText('Food')).toBeTruthy();
  expect(getByText('100%')).toBeTruthy();
  expect(getByText('₹300')).toBeTruthy();
});

it('splits share correctly across two categories', async () => {
  const categoryById = new Map([
    ['cat-food', category({ id: 'cat-food', name: 'Food' })],
    ['cat-bills', category({ id: 'cat-bills', key: 'bills', name: 'Bills' })],
  ]);
  const rows = [
    { categoryId: 'cat-food', amountMinor: 75000, n: 3 },
    { categoryId: 'cat-bills', amountMinor: 25000, n: 1 },
  ];
  const { getByText } = await render(<CategoryBreakdown rows={rows} categoryById={categoryById} period={period} />);
  expect(getByText('75%')).toBeTruthy();
  expect(getByText('25%')).toBeTruthy();
});

it('the Uncategorized row shows "Fix N" instead of a percent/amount', async () => {
  const rows = [{ categoryId: null, amountMinor: 10000, n: 4 }];
  const { getByText, queryByText } = await render(<CategoryBreakdown rows={rows} categoryById={new Map()} period={period} />);
  expect(getByText('Uncategorized')).toBeTruthy();
  expect(getByText('Fix 4')).toBeTruthy();
  expect(queryByText('100%')).toBeNull();
});

it('tapping a category row navigates to Transactions filtered by categoryIds + the period', async () => {
  const categoryById = new Map([['cat-food', category()]]);
  const { getByText } = await render(
    <CategoryBreakdown rows={[{ categoryId: 'cat-food', amountMinor: 30000, n: 2 }]} categoryById={categoryById} period={period} />,
  );
  await fireEvent.press(getByText('Food'));
  expect(mockRouterPush).toHaveBeenCalledWith(`/transactions?categoryIds=cat-food&from=${period.startMs}&to=${period.endMsExclusive}`);
});

it('tapping the Uncategorized row navigates with ?uncategorized=1', async () => {
  const rows = [{ categoryId: null, amountMinor: 10000, n: 4 }];
  const { getByText } = await render(<CategoryBreakdown rows={rows} categoryById={new Map()} period={period} />);
  await fireEvent.press(getByText('Uncategorized'));
  expect(mockRouterPush).toHaveBeenCalledWith(`/transactions?uncategorized=1&from=${period.startMs}&to=${period.endMsExclusive}`);
});
