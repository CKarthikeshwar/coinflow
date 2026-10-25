import { act, fireEvent, render } from '@testing-library/react-native';

import type { Category } from '@/db/schema';
import { useAddSheetDraft, useSheetRegistry } from '@/stores';

import { CategoryPickerSheet, flushPendingCategoryPick, PICK_SETTLE_MS } from './category-picker-sheet';

// the pick is written to the draft PICK_SETTLE_MS after the parent reopens (see the picker) — let that pass
const settle = () => act(() => jest.advanceTimersByTime(PICK_SETTLE_MS));

const mockCategories: Category[] = [
  { id: 'cat-uncat', key: 'uncategorized', name: 'Uncategorized', icon: 'help-circle', kind: 'default', appliesTo: 'expense', isProtected: true, order: 0, createdAt: 0, updatedAt: 0 },
  { id: 'cat-food', key: null, name: 'Food', icon: 'utensils', kind: 'custom', appliesTo: 'expense', isProtected: false, order: 1, createdAt: 0, updatedAt: 0 },
  { id: 'cat-salary', key: 'salary', name: 'Salary', icon: 'briefcase', kind: 'default', appliesTo: 'income', isProtected: false, order: 10, createdAt: 0, updatedAt: 0 },
];

const mockRouterPush = jest.fn();

jest.mock('expo-router', () => ({ router: { push: (...args: unknown[]) => mockRouterPush(...args) } }));
jest.mock('@/db/repositories/categories', () => ({ useCategories: () => ({ data: mockCategories }) }));

afterEach(() => {
  jest.useRealTimers();
});

beforeEach(() => {
  jest.useFakeTimers();
  mockRouterPush.mockReset();
  useSheetRegistry.setState({ current: 'categoryPicker', params: {}, onRequestClose: null });
  useAddSheetDraft.getState().open({ mode: 'add', amountMinor: 50000, categoryId: null });
});

it('picking a category patches the draft and reopens the sheet named in returnTo', async () => {
  useSheetRegistry.setState({ params: { returnTo: 'edit' } });
  const { getByText } = await render(<CategoryPickerSheet />);
  await fireEvent.press(getByText('Food'));
  await settle();
  expect(useAddSheetDraft.getState().categoryId).toBe('cat-food');
  expect(useSheetRegistry.getState().current).toBe('edit');
});

it('reopens the parent FIRST and only then writes the pick, so the dirty flip never lands in the same commit as the swap (scroll-lock bug)', async () => {
  useSheetRegistry.setState({ params: { returnTo: 'edit' } });
  const { getByText } = await render(<CategoryPickerSheet />);
  await fireEvent.press(getByText('Food'));
  expect(useSheetRegistry.getState().current).toBe('edit'); // parent already reopened…
  expect(useAddSheetDraft.getState().categoryId).toBeNull(); // …but the draft is not touched yet
  expect(useAddSheetDraft.getState().dirty).toBe(false);
  await settle();
  expect(useAddSheetDraft.getState().categoryId).toBe('cat-food');
  expect(useAddSheetDraft.getState().dirty).toBe(true);
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

describe('CR-28 — only categories of the transaction kind are offered', () => {
  it('an expense sees expense categories, not income ones', async () => {
    useAddSheetDraft.getState().open({ mode: 'add', amountMinor: 50000, direction: 'debit', type: 'expense', categoryId: null });
    const { getByText, queryByText } = await render(<CategoryPickerSheet />);
    expect(getByText('Food')).toBeTruthy();
    expect(getByText('Uncategorized')).toBeTruthy();
    expect(queryByText('Salary')).toBeNull();
  });

  it('an income sees income categories (and Uncategorized), not expense ones', async () => {
    useAddSheetDraft.getState().open({ mode: 'add', amountMinor: 50000, direction: 'credit', type: 'income', categoryId: null });
    const { getByText, queryByText } = await render(<CategoryPickerSheet />);
    expect(getByText('Salary')).toBeTruthy();
    expect(getByText('Uncategorized')).toBeTruthy();
    expect(queryByText('Food')).toBeNull();
  });

  it('picking an income category writes it to the draft', async () => {
    useSheetRegistry.setState({ params: { returnTo: 'add' } });
    useAddSheetDraft.getState().open({ mode: 'add', amountMinor: 50000, direction: 'credit', type: 'income', categoryId: null });
    const { getByText } = await render(<CategoryPickerSheet />);
    await fireEvent.press(getByText('Salary'));
    await settle();
    expect(useAddSheetDraft.getState().categoryId).toBe('cat-salary');
  });
});

describe('pending pick (CR-19)', () => {
  it('flushPendingCategoryPick applies a pick immediately — a Save tapped within the delay keeps the category', async () => {
    useSheetRegistry.setState({ params: { returnTo: 'add' } });
    const { getByText } = await render(<CategoryPickerSheet />);
    await fireEvent.press(getByText('Food'));
    expect(useAddSheetDraft.getState().categoryId).toBeNull();
    flushPendingCategoryPick();
    expect(useAddSheetDraft.getState().categoryId).toBe('cat-food');
    await settle(); // the timer was cleared — nothing applies twice
    expect(useAddSheetDraft.getState().categoryId).toBe('cat-food');
  });

  it('a pick never lands on a draft that was closed in the meantime', async () => {
    useSheetRegistry.setState({ params: { returnTo: 'add' } });
    const { getByText } = await render(<CategoryPickerSheet />);
    await fireEvent.press(getByText('Food'));
    useAddSheetDraft.getState().reset(); // sheet swiped away before the delay ran out
    await settle();
    expect(useAddSheetDraft.getState().categoryId).toBeNull();
    expect(useAddSheetDraft.getState().dirty).toBe(false);
  });

  it('flush is a no-op when nothing is pending', () => {
    expect(() => flushPendingCategoryPick()).not.toThrow();
  });
});
