import { fireEvent, render } from '@testing-library/react-native';
import { Text } from 'react-native';

import { RootErrorBoundary } from './root-error-boundary';

const mockReloadAppAsync = jest.fn().mockResolvedValue(undefined);
const mockCaptureBoundaryError = jest.fn();

jest.mock('expo', () => ({ reloadAppAsync: (reason?: string) => mockReloadAppAsync(reason) }));
jest.mock('@/services/crash', () => ({
  captureBoundaryError: (...args: unknown[]) => mockCaptureBoundaryError(...args),
}));

function Bomb(): null {
  throw new Error('kaboom');
}

let consoleErrorSpy: jest.SpyInstance;

beforeEach(() => {
  mockReloadAppAsync.mockClear();
  mockCaptureBoundaryError.mockReset().mockReturnValue(null);
  // React logs the caught error to console.error — expected noise for this test file, silenced
  // so a real regression doesn't get lost in it.
  consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
});

it('renders children when nothing has thrown', async () => {
  const { getByText } = await render(
    <RootErrorBoundary>
      <Text>hello</Text>
    </RootErrorBoundary>,
  );
  expect(getByText('hello')).toBeTruthy();
});

it('catches a render throw and shows the recovery screen instead of a blank/frozen app', async () => {
  const { getByText } = await render(
    <RootErrorBoundary>
      <Bomb />
    </RootErrorBoundary>,
  );
  expect(getByText('Your data is safe.')).toBeTruthy();
  expect(mockCaptureBoundaryError).toHaveBeenCalledTimes(1);
  expect(mockCaptureBoundaryError.mock.calls[0][0]).toBeInstanceOf(Error);
});

it('shows the Sentry event id captureBoundaryError returns, once reporting is armed', async () => {
  mockCaptureBoundaryError.mockReturnValue('event-abc123');
  const { getByText } = await render(
    <RootErrorBoundary>
      <Bomb />
    </RootErrorBoundary>,
  );
  await fireEvent.press(getByText('Technical details'));
  expect(getByText(/event-abc123/)).toBeTruthy();
});

it('Reload app calls the production-safe reload, not a dev-only API', async () => {
  const { getByText } = await render(
    <RootErrorBoundary>
      <Bomb />
    </RootErrorBoundary>,
  );
  await fireEvent.press(getByText('Reload app'));
  expect(mockReloadAppAsync).toHaveBeenCalledTimes(1);
});
