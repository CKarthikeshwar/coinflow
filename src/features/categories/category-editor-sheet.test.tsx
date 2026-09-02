import { fireEvent, render } from '@testing-library/react-native';

import type { Category } from '@/db/schema';
import { useCategoryDraft, useSheetRegistry } from '@/stores';

import { CategoryEditorSheet } from './category-editor-sheet';

const mockCategories: Category[] = [
  { id: 'cat-food', key: null, name: 'Food', icon: 'utensils', kind: 'custom', isProtected: false, order: 1, createdAt: 0, updatedAt: 0 },
  { id: 'cat-other', key: 'other', name: 'Other', icon: 'shapes', kind: 'default', isProtected: true, order: 99, createdAt: 0, updatedAt: 0 },
];

const mockCreateCategory = jest.fn();
const mockUpdateCategory = jest.fn();
const mockDeleteCategory = jest.fn();
const mockCountTransactionsForCategory = jest.fn((..._args: unknown[]) => 0);

// Mocks the whole module (never `jest.requireActual` it) — the real file imports `@/db/client`,
// which calls `SQLite.openDatabaseSync` at module load time; there's no real native SQLite in
// Jest, so even a partial passthrough mock would crash on import. The error classes are
// redefined here rather than pulled from the real module — same effect, since both this test
// file and the component import from this one mocked module, `instanceof` still works.
jest.mock('@/db/repositories/categories', () => ({
  useCategories: () => ({ data: mockCategories }),
  createCategory: (...args: unknown[]) => mockCreateCategory(...args),
  updateCategory: (...args: unknown[]) => mockUpdateCategory(...args),
  deleteCategory: (...args: unknown[]) => mockDeleteCategory(...args),
  countTransactionsForCategory: (...args: unknown[]) => mockCountTransactionsForCategory(...args),
  DuplicateCategoryNameError: class DuplicateCategoryNameError extends Error {},
  ProtectedCategoryError: class ProtectedCategoryError extends Error {},
}));

beforeEach(() => {
  mockCreateCategory.mockReset();
  mockUpdateCategory.mockReset();
  mockDeleteCategory.mockReset();
  mockCountTransactionsForCategory.mockReset().mockReturnValue(0);
  useSheetRegistry.setState({ current: null, params: {}, onRequestClose: null });
  useCategoryDraft.getState().reset();
});

describe('CategoryEditorSheet — create mode', () => {
  it('renders "New category" with Save disabled until a name is entered', async () => {
    useSheetRegistry.setState({ params: {} });
    const { getByText, getByRole } = await render(<CategoryEditorSheet />);
    expect(getByText('New category')).toBeTruthy();
    expect(getByRole('button', { name: 'Save' }).props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );
  });

  it('rejects a duplicate name inline without calling createCategory (IMP-019)', async () => {
    useSheetRegistry.setState({ params: {} });
    const { getByPlaceholderText, getByText, queryByText } = await render(<CategoryEditorSheet />);
    await fireEvent.changeText(getByPlaceholderText('Category name'), 'Food');
    expect(queryByText(/already exists/)).toBeTruthy();
    await fireEvent.press(getByText('Save'));
    expect(mockCreateCategory).not.toHaveBeenCalled();
  });

  it('saves a new category with the typed name and default icon', async () => {
    useSheetRegistry.setState({ params: {} });
    const { getByPlaceholderText, getByText } = await render(<CategoryEditorSheet />);
    await fireEvent.changeText(getByPlaceholderText('Category name'), 'Groceries');
    await fireEvent.press(getByText('Save'));
    expect(mockCreateCategory).toHaveBeenCalledWith(expect.objectContaining({ name: 'Groceries' }));
  });
});

describe('CategoryEditorSheet — edit mode', () => {
  it('pre-fills the name from the target category and shows Delete', async () => {
    useSheetRegistry.setState({ params: { categoryId: 'cat-food' } });
    const { getByDisplayValue, getByText } = await render(<CategoryEditorSheet />);
    expect(getByText('Edit category')).toBeTruthy();
    expect(getByDisplayValue('Food')).toBeTruthy();
    expect(getByText('Delete')).toBeTruthy();
  });

  it('hides Delete for a protected category (Other)', async () => {
    useSheetRegistry.setState({ params: { categoryId: 'cat-other' } });
    const { queryByText } = await render(<CategoryEditorSheet />);
    expect(queryByText('Delete')).toBeNull();
  });

  it('shows the delete-confirm dialog naming the transaction count before deleting', async () => {
    mockCountTransactionsForCategory.mockReturnValue(3);
    useSheetRegistry.setState({ params: { categoryId: 'cat-food' } });
    const { getByText, getAllByText } = await render(<CategoryEditorSheet />);
    await fireEvent.press(getByText('Delete'));
    expect(getByText('3 transactions become Uncategorized.')).toBeTruthy();
    // Two "Delete" texts once the dialog is up: the footer button and the dialog's own confirm
    // button (`confirmLabel="Delete"`) — the confirm button is the second one in render order.
    const deleteTexts = getAllByText('Delete');
    await fireEvent.press(deleteTexts[deleteTexts.length - 1]);
    expect(mockDeleteCategory).toHaveBeenCalledWith('cat-food');
  });
});
