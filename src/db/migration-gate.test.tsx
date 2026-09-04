import { fireEvent, render } from '@testing-library/react-native';
import { Text } from 'react-native';

import { MigrationGate } from './migration-gate';

const mockUseMigrations = jest.fn();
const mockReloadAppAsync = jest.fn().mockResolvedValue(undefined);
const mockSeedDatabase = jest.fn();
const mockPurge = jest.fn();
const mockIsFtsAvailable = jest.fn();
const mockGetSetting = jest.fn();
const mockArmCrashReporting = jest.fn();
const mockLogWarn = jest.fn();
const mockLogError = jest.fn();
const mockExportRawDatabaseCopy = jest.fn();

jest.mock('drizzle-orm/expo-sqlite/migrator', () => ({
  useMigrations: () => mockUseMigrations(),
}));
jest.mock('expo', () => ({ reloadAppAsync: (reason?: string) => mockReloadAppAsync(reason) }));
jest.mock('./client', () => ({ db: {} }));
jest.mock('./fts', () => ({ isFtsAvailable: () => mockIsFtsAvailable() }));
jest.mock('./migrations/migrations', () => ({}));
jest.mock('./maintenance', () => ({ purge: () => mockPurge() }));
jest.mock('./repositories/settings', () => ({ getSetting: (...args: unknown[]) => mockGetSetting(...args) }));
jest.mock('./seed', () => ({ seedDatabase: () => mockSeedDatabase() }));
jest.mock('@/lib/log', () => ({
  log: { warn: (...args: unknown[]) => mockLogWarn(...args), error: (...args: unknown[]) => mockLogError(...args) },
}));
jest.mock('@/services/crash', () => ({ armCrashReporting: (...args: unknown[]) => mockArmCrashReporting(...args) }));
jest.mock('@/features/settings/export', () => ({
  exportRawDatabaseCopy: (...args: unknown[]) => mockExportRawDatabaseCopy(...args),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockReloadAppAsync.mockResolvedValue(undefined);
  mockGetSetting.mockReturnValue(false);
  mockExportRawDatabaseCopy.mockResolvedValue(undefined);
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

it('reads crashReportingEnabled once at startup and arms/disarms Sentry accordingly (§22.4/§33.4)', async () => {
  mockGetSetting.mockReturnValue(true);
  mockUseMigrations.mockReturnValue({ success: true, error: undefined });
  await render(
    <MigrationGate>
      <Text>hello</Text>
    </MigrationGate>,
  );
  expect(mockGetSetting).toHaveBeenCalledWith('crashReportingEnabled', false);
  expect(mockArmCrashReporting).toHaveBeenCalledWith(true);
});

it('logs (but does not throw past) a seed/purge failure', async () => {
  mockSeedDatabase.mockImplementation(() => {
    throw new Error('seed boom');
  });
  mockUseMigrations.mockReturnValue({ success: true, error: undefined });
  const { findByText } = await render(
    <MigrationGate>
      <Text>hello</Text>
    </MigrationGate>,
  );
  expect(await findByText('hello')).toBeTruthy();
  expect(mockLogWarn).toHaveBeenCalledWith(expect.any(Error), 'migration-gate/post-migrate');
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
  expect(mockLogError).toHaveBeenCalledWith(expect.any(Error), 'migration-gate/migration');
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

describe('"Export a copy" escape hatch (§32.3, for when the DB won\'t even open)', () => {
  beforeEach(() => {
    mockUseMigrations.mockReturnValue({ success: false, error: new Error('boom') });
  });

  it('calls exportRawDatabaseCopy on press', async () => {
    const { getByText } = await render(
      <MigrationGate>
        <></>
      </MigrationGate>,
    );
    await fireEvent.press(getByText('Export a copy'));
    expect(mockExportRawDatabaseCopy).toHaveBeenCalledTimes(1);
  });

  it('shows an inline error, not a crash, when the export fails', async () => {
    mockExportRawDatabaseCopy.mockRejectedValue(new Error('no db file'));
    const { getByText, findByText } = await render(
      <MigrationGate>
        <></>
      </MigrationGate>,
    );
    await fireEvent.press(getByText('Export a copy'));
    expect(await findByText(/Couldn.t export a copy/)).toBeTruthy();
    expect(mockLogWarn).toHaveBeenCalledWith(expect.any(Error), 'migration-gate/export-raw');
  });

  it('does not touch the database write path — this screen never seeds/purges', async () => {
    const { getByText } = await render(
      <MigrationGate>
        <></>
      </MigrationGate>,
    );
    await fireEvent.press(getByText('Export a copy'));
    expect(mockSeedDatabase).not.toHaveBeenCalled();
  });
});
