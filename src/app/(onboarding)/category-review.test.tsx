import { fireEvent, render } from '@testing-library/react-native';

import type { Category } from '@/db/schema';

import CategoryReviewScreen from './category-review';

const mockRouterBack = jest.fn();
const mockRouterReplace = jest.fn();
const mockGoTo = jest.fn();
const mockDeleteCategory = jest.fn();
const mockSetSetting = jest.fn();
const mockReset = jest.fn();

let mockCategories: Category[];
let mockOnboardingState: { disabledCategoryIds: string[]; categoryOrder: string[] | null };

jest.mock('expo-router', () => ({
  router: { back: (...args: unknown[]) => mockRouterBack(...args), replace: (...args: unknown[]) => mockRouterReplace(...args) },
}));
jest.mock('@/db/repositories/categories', () => ({
  useCategories: () => ({ data: mockCategories }),
  deleteCategory: (...args: unknown[]) => mockDeleteCategory(...args),
}));
jest.mock('@/db/repositories/settings', () => ({ setSetting: (...args: unknown[]) => mockSetSetting(...args) }));

const mockToggleCategory = jest.fn((id: string) => {
  mockOnboardingState = {
    ...mockOnboardingState,
    disabledCategoryIds: mockOnboardingState.disabledCategoryIds.includes(id)
      ? mockOnboardingState.disabledCategoryIds.filter((x) => x !== id)
      : [...mockOnboardingState.disabledCategoryIds, id],
  };
});

// `useOnboarding` is built *inside* the factory (not assigned from an outer const) so every
// lookup of `mockOnboardingState`/`mockToggleCategory`/etc. is deferred to call time via
// closure, not resolved the moment `@/stores` is first required — which happens as soon as
// `import CategoryReviewScreen` above runs, before any of this file's own `const`s below it
// have initialized. Same reasoning as `mockTextStub`-style helpers elsewhere in this suite.
jest.mock('@/stores', () => ({
  useOnboarding: Object.assign(
    (selector: (s: unknown) => unknown) =>
      selector({
        disabledCategoryIds: mockOnboardingState.disabledCategoryIds,
        toggleCategory: mockToggleCategory,
        goTo: mockGoTo,
      }),
    { getState: () => ({ ...mockOnboardingState, reset: mockReset }) },
  ),
}));

function category(overrides: Partial<Category> = {}): Category {
  return {
    id: 'cat-food',
    key: 'food',
    name: 'Food',
    icon: 'utensils',
    kind: 'default',
    isProtected: false,
    order: 1,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

beforeEach(() => {
  mockRouterBack.mockReset();
  mockRouterReplace.mockReset();
  mockGoTo.mockReset();
  mockDeleteCategory.mockReset();
  mockSetSetting.mockReset();
  mockReset.mockReset();
  mockToggleCategory.mockClear();
  mockOnboardingState = { disabledCategoryIds: [], categoryOrder: null };
  mockCategories = [
    category({ id: 'cat-food', key: 'food', name: 'Food' }),
    category({ id: 'cat-transport', key: 'transport', name: 'Transport', order: 2 }),
    category({ id: 'cat-uncat', key: 'uncategorized', name: 'Uncategorized', kind: 'system', isProtected: true, order: 0 }),
    category({ id: 'cat-other', key: 'other', name: 'Other', kind: 'default', isProtected: true, order: 9 }),
  ];
});

it('sets the onboarding step to 3 on mount', async () => {
  await render(<CategoryReviewScreen />);
  expect(mockGoTo).toHaveBeenCalledWith(3);
});

it('lists the real default categories (kind=default, not protected), all checked by default', async () => {
  const { getByText } = await render(<CategoryReviewScreen />);
  expect(getByText('Food')).toBeTruthy();
  expect(getByText('Transport')).toBeTruthy();
});

it('excludes protected rows (Other, Uncategorized) — they cannot be deleted, so no toggle for them', async () => {
  const { queryByText } = await render(<CategoryReviewScreen />);
  expect(queryByText('Other')).toBeNull();
  expect(queryByText('Uncategorized')).toBeNull();
});

it('tapping a row calls toggleCategory with that category\'s id', async () => {
  const { getByText } = await render(<CategoryReviewScreen />);
  await fireEvent.press(getByText('Food'));
  expect(mockToggleCategory).toHaveBeenCalledWith('cat-food');
});

it('Done deletes every toggled-off category, marks onboarding done, resets the store, and replaces nav', async () => {
  mockOnboardingState.disabledCategoryIds = ['cat-transport'];
  const { getByText } = await render(<CategoryReviewScreen />);
  await fireEvent.press(getByText('Done'));
  expect(mockDeleteCategory).toHaveBeenCalledWith('cat-transport');
  expect(mockDeleteCategory).not.toHaveBeenCalledWith('cat-food');
  expect(mockSetSetting).toHaveBeenCalledWith('onboardingDone', true);
  expect(mockReset).toHaveBeenCalled();
  expect(mockRouterReplace).toHaveBeenCalledWith('/');
});

it('Done with nothing toggled off deletes nothing', async () => {
  const { getByText } = await render(<CategoryReviewScreen />);
  await fireEvent.press(getByText('Done'));
  expect(mockDeleteCategory).not.toHaveBeenCalled();
  expect(mockSetSetting).toHaveBeenCalledWith('onboardingDone', true);
});

it('back button calls router.back', async () => {
  const { getByLabelText } = await render(<CategoryReviewScreen />);
  await fireEvent.press(getByLabelText('Back'));
  expect(mockRouterBack).toHaveBeenCalled();
});
