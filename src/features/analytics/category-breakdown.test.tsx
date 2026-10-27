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
    appliesTo: 'expense',
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
  const { getByText, getAllByText } = await render(
    <CategoryBreakdown rows={[{ categoryId: 'cat-food', amountMinor: 30000, n: 2 }]} categoryById={categoryById} period={period} />,
  );
  expect(getByText('Food')).toBeTruthy();
  expect(getByText('100%')).toBeTruthy();
  // the amount shows on its row and as the donut's centre total
  expect(getAllByText('₹300')).toHaveLength(2);
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
  expect(mockRouterPush).toHaveBeenCalledWith(`/transactions?uncategorized=1&type=expense&from=${period.startMs}&to=${period.endMsExclusive}`);
});

it('the income side filters its Uncategorized row to income (CR-28)', async () => {
  const rows = [{ categoryId: null, amountMinor: 5000, n: 2 }];
  const { getByText } = await render(<CategoryBreakdown kind="income" rows={rows} categoryById={new Map()} period={period} />);
  await fireEvent.press(getByText('Uncategorized'));
  expect(mockRouterPush).toHaveBeenCalledWith(
    `/transactions?uncategorized=1&type=income&from=${period.startMs}&to=${period.endMsExclusive}`,
  );
});

describe('CR-27 — Spent / Income switch, eye buttons, hidden categories', () => {
  const categoryById = new Map([
    ['cat-food', category({ id: 'cat-food', name: 'Food' })],
    ['cat-bills', category({ id: 'cat-bills', key: 'bills', name: 'Bills' })],
  ]);
  const rows = [
    { categoryId: 'cat-food', amountMinor: 75000, n: 3 },
    { categoryId: 'cat-bills', amountMinor: 25000, n: 1 },
  ];

  it('is titled Breakdown, and shows the switch only when it can switch', async () => {
    const { getByText, queryByText, rerender } = await render(
      <CategoryBreakdown rows={rows} categoryById={categoryById} period={period} />,
    );
    expect(getByText('Breakdown')).toBeTruthy();
    expect(queryByText('Spent')).toBeNull();
    const onKindChange = jest.fn();
    await rerender(<CategoryBreakdown rows={rows} categoryById={categoryById} period={period} onKindChange={onKindChange} />);
    await fireEvent.press(getByText('Income'));
    expect(onKindChange).toHaveBeenCalledWith('income');
  });

  it('the eye toggles a category by id, and the label says what it will do', async () => {
    const onToggleHidden = jest.fn();
    const { getByLabelText } = await render(
      <CategoryBreakdown rows={rows} categoryById={categoryById} period={period} onToggleHidden={onToggleHidden} />,
    );
    await fireEvent.press(getByLabelText('Hide Food'));
    expect(onToggleHidden).toHaveBeenCalledWith('cat-food');
  });

  it('a hidden category stays listed (so it can come back) but leaves the shares and the centre total', async () => {
    const onToggleHidden = jest.fn();
    const onShowAll = jest.fn();
    const { getByText, getByLabelText, getByLabelText: label } = await render(
      <CategoryBreakdown
        rows={rows}
        categoryById={categoryById}
        period={period}
        hiddenIds={['cat-food']}
        onToggleHidden={onToggleHidden}
        onShowAll={onShowAll}
      />,
    );
    // Bills is now everything that is shown
    expect(getByText('100%')).toBeTruthy();
    expect(getByLabelText('Shown total').props.children).toBe('₹250');
    // Food is still there, marked hidden, with its eye now offering to show it
    expect(getByText('hidden')).toBeTruthy();
    expect(getByText('Hidden: Food')).toBeTruthy();
    await fireEvent.press(label('Show Food'));
    expect(onToggleHidden).toHaveBeenCalledWith('cat-food');
    await fireEvent.press(getByText('Show all'));
    expect(onShowAll).toHaveBeenCalled();
  });

  it('hiding everything says so and offers Show all', async () => {
    const onShowAll = jest.fn();
    const { getByText } = await render(
      <CategoryBreakdown
        rows={rows}
        categoryById={categoryById}
        period={period}
        hiddenIds={['cat-food', 'cat-bills']}
        onShowAll={onShowAll}
      />,
    );
    expect(getByText('Everything is hidden.')).toBeTruthy();
    await fireEvent.press(getByText('Show all'));
    expect(onShowAll).toHaveBeenCalled();
  });

  it('the Uncategorized row can be hidden too, under the "uncategorized" key', async () => {
    const onToggleHidden = jest.fn();
    const { getByLabelText } = await render(
      <CategoryBreakdown
        rows={[{ categoryId: null, amountMinor: 10000, n: 4 }]}
        categoryById={new Map()}
        period={period}
        onToggleHidden={onToggleHidden}
      />,
    );
    await fireEvent.press(getByLabelText('Hide Uncategorized'));
    expect(onToggleHidden).toHaveBeenCalledWith('uncategorized');
  });

  it('carries the chosen accounts into the Transactions link, leaving the No-account marker out', async () => {
    const { getByText } = await render(
      <CategoryBreakdown rows={rows} categoryById={categoryById} period={period} accountIds={['acc-1', 'none']} />,
    );
    await fireEvent.press(getByText('Food'));
    expect(mockRouterPush).toHaveBeenCalledWith(
      `/transactions?categoryIds=cat-food&from=${period.startMs}&to=${period.endMsExclusive}&accountIds=acc-1`,
    );
  });
});
