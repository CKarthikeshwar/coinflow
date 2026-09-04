import { fireEvent, render } from '@testing-library/react-native';

import type { Category } from '@/db/schema';
import { useAddSheetDraft, useSheetRegistry } from '@/stores';

import { CategoryPickerSheet } from './category-picker-sheet';

const mockCategories: Category[] = [
  { id: 'cat-uncat', key: 'uncategorized', name: 'Uncategorized', icon: 'help-circle', kind: 'default', isProtected: true, order: 0, createdAt: 0, updatedAt: 0 },
  { id: 'cat-food', key: null, name: 'Food', icon: 'utensils', kind: 'custom', isProtected: false, order: 1, createdAt: 0, updatedAt: 0 },
];

const mockRouterPush = jest.fn();

jest.mock('expo-router', () => ({ router: { push: (...args: unknown[]) => mockRouterPush(...args) } }));
jest.mock('@/db/repositories/categories', () => ({ useCategories: () => ({ data: mockCategories }) }));

beforeEach(() => {
  mockRouterPush.mockReset();
  useSheetRegistry.setState({ current: 'categoryPicker', params: {}, onRequestClose: null });
  useAddSheetDraft.getState().open({ mode: 'add', amountMinor: 50000, categoryId: null });
});

it('picking a category patches the draft and reopens the sheet named in returnTo', async () => {
  useSheetRegistry.setState({ params: { returnTo: 'edit' } });
  const { getByText } = await render(<CategoryPickerSheet />);
  await fireEvent.press(getByText('Food'));
  expect(useAddSheetDraft.getState().categoryId).toBe('cat-food');
  expect(useSheetRegistry.getState().current).toBe('edit');
});

it('falls back to "add" when returnTo is missing', async () => {
  useSheetRegistry.setState({ params: {} });
  const { getByText } = await render(<CategoryPickerSheet />);
  await fireEvent.press(getByText('Food'));
  expect(useSheetRegistry.getState().current).toBe('add');
});

it('"Manage categories" closes the whole sheet stack and navigates, not a return-to-parent', async () => {
  useSheetRegistry.setState({ params: { returnTo: 'add' } });
  const { getByText } = await render(<CategoryPickerSheet />);
  await fireEvent.press(getByText('Manage categories'));
  expect(useSheetRegistry.getState().current).toBeNull();
  expect(mockRouterPush).toHaveBeenCalledWith('/categories');
});

describe('regression: hardware/gesture back used to wipe the whole sheet stack instead of returning to the parent sheet', () => {
  it('registers a requestClose handler on mount (the picker has no on-screen Cancel of its own)', async () => {
    useSheetRegistry.setState({ params: { returnTo: 'edit' } });
    await render(<CategoryPickerSheet />);
    expect(useSheetRegistry.getState().onRequestClose).not.toBeNull();
  });

  it('requestClose() (what SheetHost calls on back) reopens returnTo, preserving the draft — not a plain close', async () => {
    useSheetRegistry.setState({ params: { returnTo: 'edit' } });
    await render(<CategoryPickerSheet />);

    useSheetRegistry.getState().requestClose();

    expect(useSheetRegistry.getState().current).toBe('edit');
    expect(useAddSheetDraft.getState().amountMinor).toBe(50000); // untouched — not reset/discarded
    expect(useAddSheetDraft.getState().categoryId).toBeNull(); // untouched — no category was picked
  });

  it('unregisters the handler on unmount so a later back press on a different sheet is unaffected', async () => {
    useSheetRegistry.setState({ params: { returnTo: 'edit' } });
    const { unmount } = await render(<CategoryPickerSheet />);
    expect(useSheetRegistry.getState().onRequestClose).not.toBeNull();
    await unmount();
    expect(useSheetRegistry.getState().onRequestClose).toBeNull();
  });
});
