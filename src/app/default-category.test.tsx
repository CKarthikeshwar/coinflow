import { fireEvent, render } from '@testing-library/react-native';

import DefaultCategoryScreen from './default-category';

const mockRouterBack = jest.fn();
const mockSetSetting = jest.fn();
let mockStored: string | null;

let mockKind: string | undefined;
jest.mock('expo-router', () => ({
  router: { back: (...args: unknown[]) => mockRouterBack(...args) },
  useLocalSearchParams: () => ({ kind: mockKind }),
}));
jest.mock('@/db/repositories/categories', () => ({
  useCategories: () => ({
    data: [
      { id: 'cat-uncat', name: 'Uncategorized', icon: 'circle-help', kind: 'system', appliesTo: 'expense' },
      { id: 'cat-food', name: 'Food', icon: 'tag', kind: 'default', appliesTo: 'expense' },
      { id: 'cat-fuel', name: 'Fuel', icon: 'tag', kind: 'custom', appliesTo: 'expense' },
      { id: 'cat-salary', name: 'Salary', icon: 'tag', kind: 'default', appliesTo: 'income' },
    ],
  }),
  resolveDefaultCategory: (id: string | null, list: { id: string; kind: string; appliesTo: string }[], kind = 'expense') => {
    const found = list.find((c) => c.id === id);
    return found && found.kind !== 'system' && found.appliesTo === kind ? found : null;
  },
}));
jest.mock('@/db/repositories/settings', () => ({
  useSetting: () => ({ value: mockStored }),
  setSetting: (...args: unknown[]) => mockSetSetting(...args),
}));

beforeEach(() => {
  mockRouterBack.mockReset();
  mockSetSetting.mockReset();
  mockStored = null;
  mockKind = undefined;
});

describe('DefaultCategoryScreen', () => {
  it('marks None selected when unset', async () => {
    const { getByRole } = await render(<DefaultCategoryScreen />);
    expect(getByRole('radio', { name: 'None' }).props.accessibilityState.selected).toBe(true);
  });

  it('does not offer the system Uncategorized row (None means that)', async () => {
    const { queryByRole } = await render(<DefaultCategoryScreen />);
    expect(queryByRole('radio', { name: 'Uncategorized' })).toBeNull();
  });

  it('marks the stored category selected', async () => {
    mockStored = 'cat-fuel';
    const { getByRole } = await render(<DefaultCategoryScreen />);
    expect(getByRole('radio', { name: 'Fuel' }).props.accessibilityState.selected).toBe(true);
    expect(getByRole('radio', { name: 'None' }).props.accessibilityState.selected).toBe(false);
  });

  it('saves the chosen category and goes back', async () => {
    const { getByText } = await render(<DefaultCategoryScreen />);
    await fireEvent.press(getByText('Food'));
    expect(mockSetSetting).toHaveBeenCalledWith('defaultCategoryId', 'cat-food');
    expect(mockRouterBack).toHaveBeenCalled();
  });

  it('the expense screen offers only expense categories (CR-28)', async () => {
    const { queryByText } = await render(<DefaultCategoryScreen />);
    expect(queryByText('Salary')).toBeNull();
  });

  it('?kind=income offers only income categories and saves to defaultIncomeCategoryId (CR-28)', async () => {
    mockKind = 'income';
    const { getByText, queryByText } = await render(<DefaultCategoryScreen />);
    expect(queryByText('Food')).toBeNull();
    expect(getByText('Default income category')).toBeTruthy();
    await fireEvent.press(getByText('Salary'));
    expect(mockSetSetting).toHaveBeenCalledWith('defaultIncomeCategoryId', 'cat-salary');
    expect(mockRouterBack).toHaveBeenCalled();
  });

  it('None clears the default', async () => {
    mockStored = 'cat-food';
    const { getByText } = await render(<DefaultCategoryScreen />);
    await fireEvent.press(getByText('None'));
    expect(mockSetSetting).toHaveBeenCalledWith('defaultCategoryId', null);
  });
});
