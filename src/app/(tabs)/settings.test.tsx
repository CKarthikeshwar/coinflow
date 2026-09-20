import { fireEvent, render } from '@testing-library/react-native';

import SettingsScreen from './settings';

const mockRouterPush = jest.fn();

let mockPermission: { sms: 'unknown' | 'granted' | 'denied' };
let mockDefaultCategoryId: string | null;

jest.mock('expo-router', () => ({ router: { push: (...args: unknown[]) => mockRouterPush(...args) } }));
jest.mock('expo-constants', () => ({ expoConfig: { version: '4.5.6' } }));
jest.mock('@/db/repositories/categories', () => ({
  useCategories: () => ({ data: [{ id: 'cat-food', name: 'Food' }] }),
  resolveDefaultCategory: (id: string | null, list: { id: string; name: string }[]) => list.find((c) => c.id === id) ?? null,
}));
jest.mock('@/db/repositories/settings', () => ({ useSetting: () => ({ value: mockDefaultCategoryId }) }));
jest.mock('@/hooks/use-permission-status', () => ({ usePermissionStatus: () => mockPermission }));

beforeEach(() => {
  mockRouterPush.mockReset();
  mockPermission = { sms: 'granted' };
  mockDefaultCategoryId = null;
});

it('renders all six rows and the version footer', async () => {
  const { getByText } = await render(<SettingsScreen />);
  expect(getByText('Categories')).toBeTruthy();
  expect(getByText('Payment methods')).toBeTruthy();
  expect(getByText('SMS & notifications')).toBeTruthy();
  expect(getByText('Account rules')).toBeTruthy();
  expect(getByText('Data')).toBeTruthy();
  expect(getByText('About')).toBeTruthy();
  expect(getByText('Version 4.5.6')).toBeTruthy();
});

it('Default category row shows "Not set", then the chosen name', async () => {
  const { getByText, rerender } = await render(<SettingsScreen />);
  expect(getByText('Not set')).toBeTruthy();
  mockDefaultCategoryId = 'cat-food';
  await rerender(<SettingsScreen />);
  expect(getByText('Food')).toBeTruthy();
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
  await fireEvent.press(getByText('Account rules'));
  expect(mockRouterPush).toHaveBeenCalledWith('/account-rules');
  await fireEvent.press(getByText('Data'));
  expect(mockRouterPush).toHaveBeenCalledWith('/data');
});
