import { fireEvent, render } from '@testing-library/react-native';

import type { AccountRule, Category } from '@/db/schema';
import { useSheetRegistry } from '@/stores';

import AccountRulesScreen from './account-rules';

const mockRouterBack = jest.fn();
const mockDeleteAccountRule = jest.fn();

let mockRules: AccountRule[];
let mockCategories: Category[];

jest.mock('expo-router', () => ({ router: { back: (...args: unknown[]) => mockRouterBack(...args) } }));

// Mocks the whole module (never `jest.requireActual` it) — the real files import `@/db/client`,
// which calls `SQLite.openDatabaseSync` at module load; there's no real native SQLite in Jest.
jest.mock('@/db/repositories/account-rules', () => ({
  useAccountRules: () => ({ data: mockRules }),
  deleteAccountRule: (...args: unknown[]) => mockDeleteAccountRule(...args),
}));
jest.mock('@/db/repositories/categories', () => ({
  useCategories: () => ({ data: mockCategories }),
}));

function rule(overrides: Partial<AccountRule> = {}): AccountRule {
  return {
    normalizedKey: 'swiggy',
    displayAccount: 'Swiggy',
    lastNote: 'Dinner',
    categoryId: 'cat-food',
    lastPaymentMethod: 'upi',
    hitCount: 3,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

beforeEach(() => {
  mockRouterBack.mockReset();
  mockDeleteAccountRule.mockReset();
  useSheetRegistry.setState({ current: null, params: {}, onRequestClose: null });
  mockCategories = [
    { id: 'cat-food', key: null, name: 'Food', icon: 'utensils', kind: 'custom', isProtected: false, order: 1, createdAt: 0, updatedAt: 0 },
  ];
  mockRules = [rule()];
});

it('shows the empty state when there are no rules yet', async () => {
  mockRules = [];
  const { getByText } = await render(<AccountRulesScreen />);
  expect(getByText(/No rules yet/)).toBeTruthy();
});

it('renders a row per rule with its account, note, category chip, and usage count', async () => {
  const { getByText } = await render(<AccountRulesScreen />);
  expect(getByText('Swiggy')).toBeTruthy();
  expect(getByText('Dinner')).toBeTruthy();
  expect(getByText('Food')).toBeTruthy();
  expect(getByText('3 uses')).toBeTruthy();
});

it('shows "No note" and an "Uncategorized" chip for a rule with neither', async () => {
  mockRules = [rule({ lastNote: null, categoryId: null })];
  const { getByText } = await render(<AccountRulesScreen />);
  expect(getByText('No note')).toBeTruthy();
  expect(getByText('Uncategorized')).toBeTruthy();
});

it('tapping a row opens the editAccountRule sheet with that rule\'s normalizedKey', async () => {
  const { getByText } = await render(<AccountRulesScreen />);
  await fireEvent.press(getByText('Swiggy'));
  expect(useSheetRegistry.getState()).toEqual(
    expect.objectContaining({ current: 'editAccountRule', params: { normalizedKey: 'swiggy' } }),
  );
});

it('tapping delete shows a confirm dialog, and confirming calls deleteAccountRule', async () => {
  const { getByLabelText, getAllByText } = await render(<AccountRulesScreen />);
  await fireEvent.press(getByLabelText('Delete rule for Swiggy'));
  const deleteTexts = getAllByText('Delete');
  await fireEvent.press(deleteTexts[deleteTexts.length - 1]);
  expect(mockDeleteAccountRule).toHaveBeenCalledWith('swiggy');
});

it('back button calls router.back', async () => {
  const { getByLabelText } = await render(<AccountRulesScreen />);
  await fireEvent.press(getByLabelText('Back'));
  expect(mockRouterBack).toHaveBeenCalled();
});
