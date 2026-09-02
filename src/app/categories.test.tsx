import { fireEvent, render } from '@testing-library/react-native';

import type { Category } from '@/db/schema';
import { useSheetRegistry } from '@/stores';

import CategoriesScreen from './categories';

const mockRouterBack = jest.fn();
const mockCountTransactionsForCategory = jest.fn((..._args: unknown[]) => 0);
const mockDeleteCategory = jest.fn();

let mockCategories: Category[];

jest.mock('expo-router', () => ({ router: { back: (...args: unknown[]) => mockRouterBack(...args) } }));
jest.mock('@/db/repositories/categories', () => ({
  countTransactionsForCategory: (...args: unknown[]) => mockCountTransactionsForCategory(...args),
  deleteCategory: (...args: unknown[]) => mockDeleteCategory(...args),
  useCategories: () => ({ data: mockCategories }),
}));

function category(overrides: Partial<Category> = {}): Category {
  return {
    id: 'cat-food',
    key: null,
    name: 'Food',
    icon: 'utensils',
    kind: 'custom',
    isProtected: false,
    order: 1,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

beforeEach(() => {
  mockRouterBack.mockReset();
  mockCountTransactionsForCategory.mockReset().mockReturnValue(0);
  mockDeleteCategory.mockReset();
  useSheetRegistry.setState({ current: null, params: {}, onRequestClose: null });
  mockCategories = [
    category({ id: 'cat-other', key: 'other', name: 'Other', kind: 'default', isProtected: true, order: 99 }),
  ];
});

it('shows "No custom categories yet." when there are none', async () => {
  const { getByText } = await render(<CategoriesScreen />);
  expect(getByText('No custom categories yet.')).toBeTruthy();
});

it('splits default (non-custom) and custom categories into their own sections', async () => {
  mockCategories = [
    category({ id: 'cat-other', key: 'other', name: 'Other', kind: 'default', isProtected: true }),
    category({ id: 'cat-groceries', name: 'Groceries', kind: 'custom' }),
  ];
  const { getByText, queryByText } = await render(<CategoriesScreen />);
  expect(getByText('Other')).toBeTruthy();
  expect(getByText('Groceries')).toBeTruthy();
  expect(queryByText('No custom categories yet.')).toBeNull();
});

it('a protected category has no delete affordance', async () => {
  const { queryByLabelText } = await render(<CategoriesScreen />);
  expect(queryByLabelText('Delete Other')).toBeNull();
});

it('a custom category has a delete affordance that shows the transaction count', async () => {
  mockCategories = [category({ name: 'Groceries' })];
  mockCountTransactionsForCategory.mockReturnValue(4);
  const { getByLabelText, getByText } = await render(<CategoriesScreen />);
  await fireEvent.press(getByLabelText('Delete Groceries'));
  expect(getByText('4 transactions become Uncategorized.')).toBeTruthy();
});

it('confirming delete calls deleteCategory with the row id', async () => {
  mockCategories = [category({ id: 'cat-groceries', name: 'Groceries' })];
  const { getByLabelText, getAllByText } = await render(<CategoriesScreen />);
  await fireEvent.press(getByLabelText('Delete Groceries'));
  const deleteTexts = getAllByText('Delete');
  await fireEvent.press(deleteTexts[deleteTexts.length - 1]);
  expect(mockDeleteCategory).toHaveBeenCalledWith('cat-groceries');
});

it('tapping a row opens the Edit sheet for that category', async () => {
  mockCategories = [category({ id: 'cat-groceries', name: 'Groceries' })];
  const { getByText } = await render(<CategoriesScreen />);
  await fireEvent.press(getByText('Groceries'));
  expect(useSheetRegistry.getState()).toEqual(
    expect.objectContaining({ current: 'editCategory', params: { categoryId: 'cat-groceries' } }),
  );
});

it('"Add category" opens the Create sheet', async () => {
  const { getByLabelText } = await render(<CategoriesScreen />);
  await fireEvent.press(getByLabelText('Add category'));
  expect(useSheetRegistry.getState().current).toBe('createCategory');
});
