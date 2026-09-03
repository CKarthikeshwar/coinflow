import { fireEvent, render } from '@testing-library/react-native';
import { Linking } from 'react-native';

import SmsNotificationsScreen from './sms-notifications';

const mockRouterBack = jest.fn();
const mockRequestSmsPermissions = jest.fn();
const mockRequestNotificationPermissions = jest.fn();
const mockOpenSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
let mockRefresh = jest.fn();

let mockPermission: {
  sms: 'unknown' | 'granted' | 'denied';
  smsCanAskAgain: boolean;
  notifications: 'unknown' | 'granted' | 'denied';
  notificationsCanAskAgain: boolean;
  refresh: () => void;
};

jest.mock('expo-router', () => ({ router: { back: (...args: unknown[]) => mockRouterBack(...args) } }));
jest.mock('expo-notifications', () => ({
  requestPermissionsAsync: (...args: unknown[]) => mockRequestNotificationPermissions(...args),
}));
jest.mock('@/services/sms', () => ({ requestSmsPermissions: (...args: unknown[]) => mockRequestSmsPermissions(...args) }));
jest.mock('@/hooks/use-permission-status', () => ({ usePermissionStatus: () => mockPermission }));

beforeEach(() => {
  mockRouterBack.mockReset();
  mockRequestSmsPermissions.mockReset().mockResolvedValue({ granted: true });
  mockRequestNotificationPermissions.mockReset().mockResolvedValue({ granted: true });
  mockOpenSettings.mockReset().mockResolvedValue(undefined);
  mockRefresh = jest.fn();
  mockPermission = {
    sms: 'denied',
    smsCanAskAgain: true,
    notifications: 'granted',
    notificationsCanAskAgain: true,
    refresh: mockRefresh,
  };
});

it('shows both permission cards with the right title text', async () => {
  const { getByText } = await render(<SmsNotificationsScreen />);
  expect(getByText('Read transaction SMS')).toBeTruthy();
  expect(getByText('Notifications')).toBeTruthy();
});

it('notifications is marked Optional, SMS is not', async () => {
  const { getByText, queryAllByText } = await render(<SmsNotificationsScreen />);
  expect(getByText('Optional')).toBeTruthy();
  expect(queryAllByText('Optional')).toHaveLength(1);
});

it('SMS denied + canAskAgain: Enable re-requests and refreshes', async () => {
  const { getByText } = await render(<SmsNotificationsScreen />);
  await fireEvent.press(getByText('Enable'));
  expect(mockRequestSmsPermissions).toHaveBeenCalled();
  expect(mockRefresh).toHaveBeenCalled();
  expect(mockOpenSettings).not.toHaveBeenCalled();
});

it('SMS permanently denied: the action opens system settings instead of re-requesting (IMP-042)', async () => {
  mockPermission.smsCanAskAgain = false;
  const { getByText } = await render(<SmsNotificationsScreen />);
  await fireEvent.press(getByText('Open system settings'));
  expect(mockOpenSettings).toHaveBeenCalled();
  expect(mockRequestSmsPermissions).not.toHaveBeenCalled();
});

it('notifications granted shows a Granted pill, no action button for that card', async () => {
  const { getAllByText } = await render(<SmsNotificationsScreen />);
  expect(getAllByText('Granted')).toHaveLength(1);
});

it('back button calls router.back', async () => {
  const { getByLabelText } = await render(<SmsNotificationsScreen />);
  await fireEvent.press(getByLabelText('Back'));
  expect(mockRouterBack).toHaveBeenCalled();
});
