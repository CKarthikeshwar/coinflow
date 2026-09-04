import { fireEvent, render } from '@testing-library/react-native';
import { Linking } from 'react-native';

import PermissionsScreen from './permissions';

const mockRouterPush = jest.fn();
const mockRouterBack = jest.fn();
const mockGoTo = jest.fn();
const mockRequestSmsPermissions = jest.fn();
const mockRequestNotificationPermissions = jest.fn();
const mockOpenSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
let mockRefresh = jest.fn();

let mockPermission: {
  sms: 'unknown' | 'granted' | 'denied';
  smsCanAskAgain: boolean;
  notifications: 'unknown' | 'granted' | 'denied';
  notificationsCanAskAgain: boolean;
};

jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockRouterPush(...args), back: (...args: unknown[]) => mockRouterBack(...args) },
}));
jest.mock('expo-notifications', () => ({
  requestPermissionsAsync: (...args: unknown[]) => mockRequestNotificationPermissions(...args),
}));
jest.mock('@/services/sms', () => ({ requestSmsPermissions: (...args: unknown[]) => mockRequestSmsPermissions(...args) }));
jest.mock('@/hooks/use-permission-status', () => ({
  usePermissionStatus: () => ({ ...mockPermission, refresh: mockRefresh }),
}));
jest.mock('@/stores', () => ({ useOnboarding: (selector: (s: unknown) => unknown) => selector({ goTo: mockGoTo }) }));

beforeEach(() => {
  mockRouterPush.mockReset();
  mockRouterBack.mockReset();
  mockGoTo.mockReset();
  mockRequestSmsPermissions.mockReset().mockResolvedValue({ granted: true });
  mockRequestNotificationPermissions.mockReset().mockResolvedValue({ granted: true });
  mockOpenSettings.mockReset().mockResolvedValue(undefined);
  mockRefresh = jest.fn();
  mockPermission = { sms: 'denied', smsCanAskAgain: true, notifications: 'unknown', notificationsCanAskAgain: true };
});

it('sets the onboarding step to 2 on mount', async () => {
  await render(<PermissionsScreen />);
  expect(mockGoTo).toHaveBeenCalledWith(2);
});

it('shows both permission cards, Notifications marked Optional', async () => {
  const { getByText } = await render(<PermissionsScreen />);
  expect(getByText('Read transaction SMS')).toBeTruthy();
  expect(getByText('Notifications')).toBeTruthy();
  expect(getByText('Optional')).toBeTruthy();
});

it('Continue requests every still-askable permission, then refreshes and pushes (regression: used to silently skip both, same as Skip)', async () => {
  const { getByText } = await render(<PermissionsScreen />);
  await fireEvent.press(getByText('Continue'));
  expect(mockRequestSmsPermissions).toHaveBeenCalled();
  expect(mockRequestNotificationPermissions).toHaveBeenCalled();
  expect(mockRefresh).toHaveBeenCalled();
  expect(mockRouterPush).toHaveBeenCalledWith('/category-review');
});

it('Continue skips a request for a permission already granted', async () => {
  mockPermission.sms = 'granted';
  const { getByText } = await render(<PermissionsScreen />);
  await fireEvent.press(getByText('Continue'));
  expect(mockRequestSmsPermissions).not.toHaveBeenCalled();
  expect(mockRequestNotificationPermissions).toHaveBeenCalled();
  expect(mockRouterPush).toHaveBeenCalledWith('/category-review');
});

it('Continue skips a request for a permanently-denied permission (never opens system settings on its own)', async () => {
  mockPermission.smsCanAskAgain = false;
  const { getByText } = await render(<PermissionsScreen />);
  await fireEvent.press(getByText('Continue'));
  expect(mockRequestSmsPermissions).not.toHaveBeenCalled();
  expect(mockOpenSettings).not.toHaveBeenCalled();
  expect(mockRouterPush).toHaveBeenCalledWith('/category-review');
});

it('"Skip for now" pushes to /category-review without requesting anything', async () => {
  const { getByText } = await render(<PermissionsScreen />);
  await fireEvent.press(getByText('Skip for now'));
  expect(mockRequestSmsPermissions).not.toHaveBeenCalled();
  expect(mockRequestNotificationPermissions).not.toHaveBeenCalled();
  expect(mockRouterPush).toHaveBeenCalledWith('/category-review');
});

it('SMS denied + canAskAgain: Enable re-requests and refreshes', async () => {
  const { getByText } = await render(<PermissionsScreen />);
  await fireEvent.press(getByText('Enable'));
  expect(mockRequestSmsPermissions).toHaveBeenCalled();
  expect(mockRefresh).toHaveBeenCalled();
});

it('SMS permanently denied: opens system settings instead of re-requesting (IMP-042)', async () => {
  mockPermission.smsCanAskAgain = false;
  const { getByText } = await render(<PermissionsScreen />);
  await fireEvent.press(getByText('Open system settings'));
  expect(mockOpenSettings).toHaveBeenCalled();
  expect(mockRequestSmsPermissions).not.toHaveBeenCalled();
});

it('back button calls router.back', async () => {
  const { getByLabelText } = await render(<PermissionsScreen />);
  await fireEvent.press(getByLabelText('Back'));
  expect(mockRouterBack).toHaveBeenCalled();
});
