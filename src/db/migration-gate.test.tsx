import { fireEvent, render } from '@testing-library/react-native';
import { Text } from 'react-native';

import { MigrationGate } from './migration-gate';

const mockUseMigrations = jest.fn();
const mockReloadAppAsync = jest.fn().mockResolvedValue(undefined);
const mockSeedDatabase = jest.fn();
const mockPurge = jest.fn();
const mockIsFtsAvailable = jest.fn();

jest.mock('drizzle-orm/expo-sqlite/migrator', () => ({
  useMigrations: () => mockUseMigrations(),
}));
jest.mock('expo', () => ({ reloadAppAsync: (reason?: string) => mockReloadAppAsync(reason) }));
jest.mock('./client', () => ({ db: {} }));
jest.mock('./fts', () => ({ isFtsAvailable: () => mockIsFtsAvailable() }));
jest.mock('./migrations/migrations', () => ({}));
jest.mock('./maintenance', () => ({ purge: () => mockPurge() }));
jest.mock('./seed', () => ({ seedDatabase: () => mockSeedDatabase() }));

beforeEach(() => {
  jest.clearAllMocks();
  mockReloadAppAsync.mockResolvedValue(undefined);
});

it('renders nothing while migrations are still running (native splash covers it)', async () => {
  mockUseMigrations.mockReturnValue({ success: false, error: undefined });
  const { toJSON } = await render(
    <MigrationGate>
      <></>
    </MigrationGate>,
  );
  expect(toJSON()).toBeNull();
});

it('runs seed + purge once migrations succeed, then renders children', async () => {
  mockUseMigrations.mockReturnValue({ success: true, error: undefined });
  const { findByText } = await render(
    <MigrationGate>
      <Text>hello</Text>
    </MigrationGate>,
  );
  expect(await findByText('hello')).toBeTruthy();
  expect(mockSeedDatabase).toHaveBeenCalledTimes(1);
  expect(mockPurge).toHaveBeenCalledTimes(1);
  expect(mockIsFtsAvailable).toHaveBeenCalledTimes(1);
});

it('shows the non-dismissible error screen on migration failure, never renders children', async () => {
  mockUseMigrations.mockReturnValue({ success: false, error: new Error('boom') });
  const { getByText, queryByText } = await render(
    <MigrationGate>
      <Text>hello</Text>
    </MigrationGate>,
  );
  expect(getByText("CoinFlow can’t open your data")).toBeTruthy();
  expect(queryByText('hello')).toBeNull();
  expect(mockSeedDatabase).not.toHaveBeenCalled();
});

it('Try again calls the real production-safe reload, not a dev-only API (regression: DevSettings.reload() was a no-op in release builds)', async () => {
  mockUseMigrations.mockReturnValue({ success: false, error: new Error('boom') });
  const { getByText } = await render(
    <MigrationGate>
      <></>
    </MigrationGate>,
  );
  fireEvent.press(getByText('Try again'));
  expect(mockReloadAppAsync).toHaveBeenCalledTimes(1);
});
