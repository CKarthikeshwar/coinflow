import { fireEvent, render } from '@testing-library/react-native';

import WelcomeScreen from './welcome';

const mockRouterPush = jest.fn();
const mockGoTo = jest.fn();

jest.mock('expo-router', () => ({ router: { push: (...args: unknown[]) => mockRouterPush(...args) } }));
jest.mock('@/stores', () => ({ useOnboarding: (selector: (s: unknown) => unknown) => selector({ goTo: mockGoTo }) }));

beforeEach(() => {
  mockRouterPush.mockReset();
  mockGoTo.mockReset();
});

it('sets the onboarding step to 1 on mount', async () => {
  await render(<WelcomeScreen />);
  expect(mockGoTo).toHaveBeenCalledWith(1);
});

it('shows the app name and value proposition', async () => {
  const { getByText } = await render(<WelcomeScreen />);
  expect(getByText('CoinFlow')).toBeTruthy();
  expect(getByText(/Detects your bank/)).toBeTruthy();
  expect(getByText('Everything stays on this device.')).toBeTruthy();
});

it('"Get started" pushes to /permissions', async () => {
  const { getByText } = await render(<WelcomeScreen />);
  await fireEvent.press(getByText('Get started'));
  expect(mockRouterPush).toHaveBeenCalledWith('/permissions');
});
