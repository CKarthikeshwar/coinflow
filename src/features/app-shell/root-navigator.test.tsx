import { render } from '@testing-library/react-native';

import { RootNavigator } from './root-navigator';

let mockOnboardingDone: { value: boolean | undefined; updatedAt: number | undefined };

jest.mock('@/db/repositories/settings', () => ({ useSetting: () => mockOnboardingDone }));

// Minimal `Stack`/`Stack.Protected`/`Stack.Screen` stand-ins — `Protected` mimics the one
// behaviour this test actually cares about (only renders its children when `guard` is true;
// the real one instead adds/removes screens from an already-mounted navigator, but the
// observable effect from outside is the same: gated content only shows up when its guard is
// true), `Screen` just renders its own `name` as text so a test can assert which screens ended
// up inside which guard. Defined inside the factory (not closed over from outer consts) so this
// file doesn't need the `require()`-inside-a-named-mock-function dance used elsewhere in this
// suite — there's no JSX-needing-`Text`-at-module-scope problem here, only plain objects.
jest.mock('expo-router', () => {
  function MockStack({ children }: { children?: React.ReactNode }) {
    return children;
  }
  function MockProtected({ guard, children }: { guard: boolean; children?: React.ReactNode }) {
    return guard ? children : null;
  }
  function MockScreen({ name }: { name: string }) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- see file-header note
    const { createElement } = require('react');
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- see file-header note
    const { Text } = require('react-native');
    return createElement(Text, null, `Screen:${name}`);
  }
  MockStack.Protected = MockProtected;
  MockStack.Screen = MockScreen;
  return { Stack: MockStack };
});

beforeEach(() => {
  mockOnboardingDone = { value: undefined, updatedAt: undefined };
});

it('renders nothing while the setting is still resolving (splash covers it)', async () => {
  const { toJSON } = await render(<RootNavigator />);
  expect(toJSON()).toBeNull();
});

it('shows only the onboarding screen once resolved with no onboardingDone row (first launch)', async () => {
  mockOnboardingDone = { value: undefined, updatedAt: Date.now() };
  const { getByText, queryByText } = await render(<RootNavigator />);
  expect(getByText('Screen:(onboarding)')).toBeTruthy();
  expect(queryByText('Screen:(tabs)')).toBeNull();
});

it('shows only the onboarding screen once resolved with onboardingDone explicitly false', async () => {
  mockOnboardingDone = { value: false, updatedAt: Date.now() };
  const { getByText, queryByText } = await render(<RootNavigator />);
  expect(getByText('Screen:(onboarding)')).toBeTruthy();
  expect(queryByText('Screen:(tabs)')).toBeNull();
});

it('shows only the normal app screens once onboardingDone is true (UI-062)', async () => {
  mockOnboardingDone = { value: true, updatedAt: Date.now() };
  const { getByText, queryByText } = await render(<RootNavigator />);
  expect(getByText('Screen:(tabs)')).toBeTruthy();
  expect(getByText('Screen:review-queue')).toBeTruthy();
  expect(queryByText('Screen:(onboarding)')).toBeNull();
});
