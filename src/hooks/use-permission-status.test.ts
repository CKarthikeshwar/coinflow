import { act, renderHook, waitFor } from '@testing-library/react-native';

import { usePermissionStatus } from './use-permission-status';

const mockGetSmsPermissions = jest.fn();
const mockGetNotificationPermissions = jest.fn();

jest.mock('@/services/sms', () => ({ getSmsPermissions: (...args: unknown[]) => mockGetSmsPermissions(...args) }));
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: (...args: unknown[]) => mockGetNotificationPermissions(...args),
}));

beforeEach(() => {
  mockGetSmsPermissions.mockReset().mockResolvedValue({ granted: true, canAskAgain: true });
  mockGetNotificationPermissions.mockReset().mockResolvedValue({ granted: true, canAskAgain: true });
});

it('resolves sms/notifications independently from the OS response', async () => {
  mockGetSmsPermissions.mockResolvedValue({ granted: false, canAskAgain: true });
  mockGetNotificationPermissions.mockResolvedValue({ granted: true, canAskAgain: true });

  const { result } = await renderHook(() => usePermissionStatus());
  await waitFor(() => expect(result.current.sms).toBe('denied'));
  expect(result.current.notifications).toBe('granted');
});

it('carries canAskAgain through for each permission independently', async () => {
  mockGetSmsPermissions.mockResolvedValue({ granted: false, canAskAgain: false });
  mockGetNotificationPermissions.mockResolvedValue({ granted: false, canAskAgain: true });

  const { result } = await renderHook(() => usePermissionStatus());
  await waitFor(() => expect(result.current.sms).toBe('denied'));

  expect(result.current.smsCanAskAgain).toBe(false);
  expect(result.current.notificationsCanAskAgain).toBe(true);
});

it('refresh() re-checks both permissions', async () => {
  const { result } = await renderHook(() => usePermissionStatus());
  await waitFor(() => expect(result.current.sms).toBe('granted'));

  mockGetSmsPermissions.mockResolvedValue({ granted: false, canAskAgain: false });
  await act(async () => {
    await result.current.refresh();
  });

  expect(result.current.sms).toBe('denied');
  expect(result.current.smsCanAskAgain).toBe(false);
});
