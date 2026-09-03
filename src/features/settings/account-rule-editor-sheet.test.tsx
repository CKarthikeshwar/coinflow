import { fireEvent, render } from '@testing-library/react-native';

import type { AccountRule, Category } from '@/db/schema';
import { useAccountRuleDraft, useSheetRegistry } from '@/stores';

import { AccountRuleEditorSheet } from './account-rule-editor-sheet';

const mockUpdateAccountRule = jest.fn();
const mockDeleteAccountRule = jest.fn();

const mockRules: AccountRule[] = [
  {
    normalizedKey: 'swiggy',
    displayAccount: 'Swiggy',
    lastNote: 'Dinner',
    categoryId: 'cat-food',
    lastPaymentMethod: 'upi',
    hitCount: 3,
    createdAt: 0,
    updatedAt: 0,
  },
];

const mockCategories: Category[] = [
  { id: 'cat-food', key: null, name: 'Food', icon: 'utensils', kind: 'custom', isProtected: false, order: 1, createdAt: 0, updatedAt: 0 },
  { id: 'cat-uncat', key: 'uncategorized', name: 'Uncategorized', icon: 'help-circle', kind: 'default', isProtected: true, order: 0, createdAt: 0, updatedAt: 0 },
];

// Mocks the whole module (never `jest.requireActual` it) — the real files import `@/db/client`,
// which calls `SQLite.openDatabaseSync` at module load; there's no real native SQLite in Jest.
jest.mock('@/db/repositories/account-rules', () => ({
  useAccountRules: () => ({ data: mockRules }),
  updateAccountRule: (...args: unknown[]) => mockUpdateAccountRule(...args),
  deleteAccountRule: (...args: unknown[]) => mockDeleteAccountRule(...args),
}));
jest.mock('@/db/repositories/categories', () => ({
  useCategories: () => ({ data: mockCategories }),
}));

beforeEach(() => {
  mockUpdateAccountRule.mockReset();
  mockDeleteAccountRule.mockReset();
  useSheetRegistry.setState({ current: null, params: { normalizedKey: 'swiggy' }, onRequestClose: null });
  useAccountRuleDraft.getState().reset();
});

it('pre-fills the account and note from the target rule', async () => {
  const { getByText, getByDisplayValue } = await render(<AccountRuleEditorSheet />);
  expect(getByText('Swiggy')).toBeTruthy();
  expect(getByDisplayValue('Dinner')).toBeTruthy();
});

it('pre-fills the selected category — saving with no changes keeps it', async () => {
  const { getByText } = await render(<AccountRuleEditorSheet />);
  await fireEvent.press(getByText('Save'));
  expect(mockUpdateAccountRule).toHaveBeenCalledWith('swiggy', { lastNote: 'Dinner', categoryId: 'cat-food' });
});

it('saving with an edited note calls updateAccountRule with the trimmed note', async () => {
  const { getByDisplayValue, getByText } = await render(<AccountRuleEditorSheet />);
  await fireEvent.changeText(getByDisplayValue('Dinner'), '  Lunch  ');
  await fireEvent.press(getByText('Save'));
  expect(mockUpdateAccountRule).toHaveBeenCalledWith('swiggy', { lastNote: 'Lunch', categoryId: 'cat-food' });
});

it('clearing the note saves an explicit null (P-6), not an empty string', async () => {
  const { getByDisplayValue, getByText } = await render(<AccountRuleEditorSheet />);
  await fireEvent.changeText(getByDisplayValue('Dinner'), '   ');
  await fireEvent.press(getByText('Save'));
  expect(mockUpdateAccountRule).toHaveBeenCalledWith('swiggy', { lastNote: null, categoryId: 'cat-food' });
});

it('picking a different category and saving calls updateAccountRule with the new categoryId', async () => {
  const { getByText } = await render(<AccountRuleEditorSheet />);
  await fireEvent.press(getByText('Uncategorized'));
  await fireEvent.press(getByText('Save'));
  expect(mockUpdateAccountRule).toHaveBeenCalledWith('swiggy', { lastNote: 'Dinner', categoryId: null });
});

it('Cancel with no edits closes without a discard prompt', async () => {
  const { getByText, queryByText } = await render(<AccountRuleEditorSheet />);
  await fireEvent.press(getByText('Cancel'));
  expect(queryByText('Discard changes?')).toBeNull();
});

it('Cancel after an edit shows the discard-confirm dialog', async () => {
  const { getByDisplayValue, getByText } = await render(<AccountRuleEditorSheet />);
  await fireEvent.changeText(getByDisplayValue('Dinner'), 'Lunch');
  await fireEvent.press(getByText('Cancel'));
  expect(getByText('Discard changes?')).toBeTruthy();
});

it('Delete opens a confirm dialog, and confirming calls deleteAccountRule', async () => {
  const { getByText, getAllByText } = await render(<AccountRuleEditorSheet />);
  await fireEvent.press(getByText('Delete'));
  const deleteTexts = getAllByText('Delete');
  await fireEvent.press(deleteTexts[deleteTexts.length - 1]);
  expect(mockDeleteAccountRule).toHaveBeenCalledWith('swiggy');
});
