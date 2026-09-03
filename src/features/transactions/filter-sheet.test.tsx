import { fireEvent, render } from '@testing-library/react-native';

import type { Category } from '@/db/schema';
import { useFilterDraft, useSheetRegistry } from '@/stores';

import { FilterSheet } from './filter-sheet';

const mockRouterSetParams = jest.fn();
jest.mock('expo-router', () => ({ router: { setParams: (...args: unknown[]) => mockRouterSetParams(...args) } }));

const mockCategories: Category[] = [
  { id: 'cat-food', key: null, name: 'Food', icon: 'utensils', kind: 'custom', isProtected: false, order: 1, createdAt: 0, updatedAt: 0 },
  { id: 'cat-uncat', key: 'uncategorized', name: 'Uncategorized', icon: 'help-circle', kind: 'default', isProtected: true, order: 0, createdAt: 0, updatedAt: 0 },
];
jest.mock('@/db/repositories/categories', () => ({ useCategories: () => ({ data: mockCategories }) }));

beforeEach(() => {
  mockRouterSetParams.mockReset();
  useSheetRegistry.setState({ current: 'filter', params: {}, onRequestClose: null });
  useFilterDraft.getState().reset();
});

it('offers Uncategorized as its own chip once, not the system category row a second time', async () => {
  // `Uncategorized` isn't a real `category.id` to filter by (§25.3), so the dedicated chip is
  // built from a flag, not from the seeded `key:'uncategorized'` row in `categories` — which
  // stays excluded from the regular per-category chip list (F7).
  const { getAllByText, getByText } = await render(<FilterSheet />);
  expect(getAllByText('Uncategorized')).toHaveLength(1);
  expect(getByText('Food')).toBeTruthy();
});

it('F7 — toggling Uncategorized and applying writes it into the route params', async () => {
  const { getByText } = await render(<FilterSheet />);
  await fireEvent.press(getByText('Uncategorized'));
  await fireEvent.press(getByText('Apply'));
  expect(mockRouterSetParams).toHaveBeenCalledWith(expect.objectContaining({ uncategorized: '1' }));
});

it('F7 — Uncategorized can combine with a real category (OR semantics upstream)', async () => {
  const { getByText } = await render(<FilterSheet />);
  await fireEvent.press(getByText('Uncategorized'));
  await fireEvent.press(getByText('Food'));
  await fireEvent.press(getByText('Apply'));
  expect(mockRouterSetParams).toHaveBeenCalledWith(
    expect.objectContaining({ uncategorized: '1', categoryIds: 'cat-food' }),
  );
});

it('Reset is disabled with no filters, enabled after picking one', async () => {
  const { getByText, getByRole } = await render(<FilterSheet />);
  expect(getByRole('button', { name: 'Reset' }).props.accessibilityState).toEqual(
    expect.objectContaining({ disabled: true }),
  );
  await fireEvent.press(getByText('Food'));
  expect(getByRole('button', { name: 'Reset' }).props.accessibilityState).toEqual(
    expect.objectContaining({ disabled: false }),
  );
});

it('Apply writes the picked category and type into the route params', async () => {
  const { getByText } = await render(<FilterSheet />);
  await fireEvent.press(getByText('Food'));
  await fireEvent.press(getByText('Income'));
  await fireEvent.press(getByText('Apply'));
  expect(mockRouterSetParams).toHaveBeenCalledWith(
    expect.objectContaining({ categoryIds: 'cat-food', type: 'income' }),
  );
});

it('a date preset sets a from-only range with no error', async () => {
  const { getByText, queryByText } = await render(<FilterSheet />);
  await fireEvent.press(getByText('This month'));
  await fireEvent.press(getByText('Apply'));
  expect(queryByText(/is after|is invalid/)).toBeNull();
  const call = mockRouterSetParams.mock.calls[0][0];
  expect(call.from).not.toBe('');
  expect(call.to).toBe('');
});

it('Custom range with start after end shows an inline error and does not Apply', async () => {
  const { getByText, getByPlaceholderText } = await render(<FilterSheet />);
  await fireEvent.press(getByText('Custom'));
  await fireEvent.changeText(getByPlaceholderText('Start (yyyy-mm-dd)'), '2026-06-10');
  await fireEvent.changeText(getByPlaceholderText('End (yyyy-mm-dd)'), '2026-06-01');
  await fireEvent.press(getByText('Apply'));
  expect(getByText('Start date is after end date.')).toBeTruthy();
  expect(mockRouterSetParams).not.toHaveBeenCalled();
});

it('Reset clears every picked filter', async () => {
  const { getByText, getByRole } = await render(<FilterSheet />);
  await fireEvent.press(getByText('Food'));
  await fireEvent.press(getByText('Reset'));
  expect(getByRole('button', { name: 'Reset' }).props.accessibilityState).toEqual(
    expect.objectContaining({ disabled: true }),
  );
});
