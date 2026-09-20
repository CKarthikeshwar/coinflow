import { fireEvent, render } from '@testing-library/react-native';

import DefaultCategoryScreen from './default-category';

const mockRouterBack = jest.fn();
const mockSetSetting = jest.fn();
let mockStored: string | null;

jest.mock('expo-router', () => ({ router: { back: (...args: unknown[]) => mockRouterBack(...args) } }));
jest.mock('@/db/repositories/categories', () => ({
  useCategories: () => ({
    data: [
      { id: 'cat-uncat', name: 'Uncategorized', icon: 'circle-help', kind: 'system' },
      { id: 'cat-food', name: 'Food', icon: 'tag', kind: 'default' },
      { id: 'cat-fuel', name: 'Fuel', icon: 'tag', kind: 'custom' },
    ],
  }),
  resolveDefaultCategory: (id: string | null, list: { id: string; kind: string }[]) => {
    const found = list.find((c) => c.id === id);
    return found && found.kind !== 'system' ? found : null;
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

  it('None clears the default', async () => {
    mockStored = 'cat-food';
    const { getByText } = await render(<DefaultCategoryScreen />);
    await fireEvent.press(getByText('None'));
    expect(mockSetSetting).toHaveBeenCalledWith('defaultCategoryId', null);
  });
});
