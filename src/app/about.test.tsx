import { fireEvent, render } from '@testing-library/react-native';

import AboutScreen from './about';

const mockRouterBack = jest.fn();

jest.mock('expo-router', () => ({ router: { back: (...args: unknown[]) => mockRouterBack(...args) } }));
jest.mock('expo-constants', () => ({ expoConfig: { version: '9.9.9' } }));

beforeEach(() => {
  mockRouterBack.mockReset();
});

it('shows the app name, version, and the on-device privacy line', async () => {
  const { getByText } = await render(<AboutScreen />);
  expect(getByText('CoinFlow')).toBeTruthy();
  expect(getByText('Version 9.9.9')).toBeTruthy();
  expect(getByText('All your data stays on this device.')).toBeTruthy();
});

it('back button calls router.back', async () => {
  const { getByLabelText } = await render(<AboutScreen />);
  await fireEvent.press(getByLabelText('Back'));
  expect(mockRouterBack).toHaveBeenCalled();
});
