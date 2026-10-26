import { fireEvent, render } from '@testing-library/react-native';

import SettingsScreen from './settings';

const mockRouterPush = jest.fn();

let mockPermission: { sms: 'unknown' | 'granted' | 'denied' };
let mockDefaultCategoryId: string | null;

jest.mock('expo-router', () => ({ router: { push: (...args: unknown[]) => mockRouterPush(...args) } }));
jest.mock('expo-constants', () => ({ expoConfig: { version: '4.5.6' } }));
let mockDefaultIncomeCategoryId: string | null;
jest.mock('@/db/repositories/categories', () => ({
  useCategories: () => ({ data: [{ id: 'cat-food', name: 'Food', appliesTo: 'expense' }, { id: 'cat-salary', name: 'Salary', appliesTo: 'income' }] }),
  resolveDefaultCategory: (id: string | null, list: { id: string; name: string; appliesTo: string }[], kind = 'expense') =>
    list.find((c) => c.id === id && c.appliesTo === kind) ?? null,
}));
jest.mock('@/db/repositories/settings', () => ({
  useSetting: (key: string) => ({ value: key === 'defaultIncomeCategoryId' ? mockDefaultIncomeCategoryId : mockDefaultCategoryId }),
}));
jest.mock('@/hooks/use-permission-status', () => ({ usePermissionStatus: () => mockPermission }));

beforeEach(() => {
  mockRouterPush.mockReset();
  mockPermission = { sms: 'granted' };
  mockDefaultCategoryId = null;
  mockDefaultIncomeCategoryId = null;
});

it('renders all six rows and the version footer', async () => {
  const { getByText } = await render(<SettingsScreen />);
  expect(getByText('Categories')).toBeTruthy();
  expect(getByText('Payment methods')).toBeTruthy();
  expect(getByText('SMS & notifications')).toBeTruthy();
  expect(getByText('Merchant rules')).toBeTruthy();
  expect(getByText('My accounts')).toBeTruthy();
  expect(getByText('Data')).toBeTruthy();
  expect(getByText('About')).toBeTruthy();
  expect(getByText('Version 4.5.6')).toBeTruthy();
});

it('Default expense category row shows "Not set", then the chosen name', async () => {
  const { getAllByText, getByText, rerender } = await render(<SettingsScreen />);
  expect(getAllByText('Not set')).toHaveLength(2); // expense + income defaults
  mockDefaultCategoryId = 'cat-food';
  await rerender(<SettingsScreen />);
  expect(getByText('Food')).toBeTruthy();
});

it('Default income category row shows its own choice and opens the income picker (CR-28)', async () => {
  mockDefaultIncomeCategoryId = 'cat-salary';
  const { getByText } = await render(<SettingsScreen />);
  expect(getByText('Salary')).toBeTruthy();
  await fireEvent.press(getByText('Default income category'));
  expect(mockRouterPush).toHaveBeenCalledWith('/default-category?kind=income');
});

it('SMS granted shows "On" with no warning glyph', async () => {
  const { getByText } = await render(<SettingsScreen />);
  expect(getByText('On')).toBeTruthy();
});

it('SMS denied shows "Off" (UI-064)', async () => {
  mockPermission = { sms: 'denied' };
  const { getByText } = await render(<SettingsScreen />);
  expect(getByText('Off')).toBeTruthy();
});

it('tapping a row pushes its route', async () => {
  const { getByText } = await render(<SettingsScreen />);
  await fireEvent.press(getByText('Merchant rules'));
  expect(mockRouterPush).toHaveBeenCalledWith('/account-rules');
  await fireEvent.press(getByText('Data'));
  expect(mockRouterPush).toHaveBeenCalledWith('/data');
});
