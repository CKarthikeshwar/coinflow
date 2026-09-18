/**
 * `sendDiagnostics` (§17.10/§33.1, CR-12). Mocks every data source it reads from and asserts the
 * assembled bundle + share-sheet call, mirroring `export.test.ts`'s mock style.
 */

import { sendDiagnostics } from './diagnostics';

const mockGetSetting = jest.fn();
const mockGetRecentLogs = jest.fn().mockReturnValue([]);
const mockGetSmsPermissions = jest.fn();
const mockIsSmsCaptureSupported = jest.fn().mockReturnValue(true);
const mockGetNotifPermissionsAsync = jest.fn();

const mockWrite = jest.fn();
const mockCreate = jest.fn();
const mockShareAsync = jest.fn();

jest.mock('expo-constants', () => ({ expoConfig: { version: '1.2.3' } }));

jest.mock('expo-device', () => ({ osVersion: '14', manufacturer: 'Xiaomi', modelName: 'Redmi Note 12' }));

jest.mock('expo-notifications', () => ({ getPermissionsAsync: (...args: unknown[]) => mockGetNotifPermissionsAsync(...args) }));

jest.mock('@/services/sms', () => ({
  getSmsPermissions: (...args: unknown[]) => mockGetSmsPermissions(...args),
  isSmsCaptureSupported: (...args: unknown[]) => mockIsSmsCaptureSupported(...args),
}));

jest.mock('@/db/repositories/settings', () => ({ getSetting: (...args: unknown[]) => mockGetSetting(...args) }));

jest.mock('@/services/tasks/catch-stats', () => ({
  readCatchCounts: () => ({ broadcast: 5, storeTrigger: 2, sweepOpen: 1, sweepPeriodic: 0 }),
}));

jest.mock('@/lib/log', () => ({ getRecentLogs: (...args: unknown[]) => mockGetRecentLogs(...args) }));

// `./export` (for `ensureFile`) transitively imports `@/db/client`/`@/db/repositories/categories`,
// which open a real SQLite connection at import time — not available under Jest. Same two mocks
// `export.test.ts` uses, needed here purely to satisfy that transitive import.
jest.mock('@/db/client', () => ({ db: { select: () => ({ from: () => ({ where: () => ({ all: () => [] }) }) }) } }));
jest.mock('@/db/repositories/categories', () => ({ getCategoryMap: () => new Map() }));

// Same shape as `export.test.ts`'s mock; the real `ensureFile` (from `./export`) runs unmocked.
jest.mock('expo-file-system', () => {
  class MockDirectory {}
  class MockFile {
    uri = 'file:///cache/mock';
    create(...args: unknown[]) {
      mockCreate(...args);
    }
    write(...args: unknown[]) {
      mockWrite(...args);
    }
  }
  return { File: MockFile, Directory: MockDirectory, Paths: { cache: {}, document: {} } };
});

jest.mock('expo-sharing', () => ({ shareAsync: (...args: unknown[]) => mockShareAsync(...args) }));

beforeEach(() => {
  mockWrite.mockReset();
  mockCreate.mockReset();
  mockShareAsync.mockReset();
  mockGetRecentLogs.mockReset().mockReturnValue([]);
  mockIsSmsCaptureSupported.mockReset().mockReturnValue(true);
  mockGetSmsPermissions.mockReset().mockResolvedValue({ granted: true, canAskAgain: true });
  mockGetNotifPermissionsAsync.mockReset().mockResolvedValue({ granted: false, canAskAgain: true });
  mockGetSetting.mockReset().mockImplementation((key: string, fallback: unknown) => {
    const values: Record<string, unknown> = {
      smsLastRealtimeInvokedAt: 1_700_000_000_000,
      smsLastReconcileSweepAt: 1_700_000_100_000,
      smsLastReconcileMatchCount: 2,
      smsLastStoreTriggerAt: 1_700_000_200_000,
      crashReportingEnabled: true,
    };
    return key in values ? values[key] : fallback;
  });
});

describe('sendDiagnostics', () => {
  it('bundles device, permission, pipeline-health, crash-reporting, and log fields', async () => {
    mockGetRecentLogs.mockReturnValue([{ ts: 1, level: 'error', op: 'x', name: 'Error', message: 'boom' }]);

    await sendDiagnostics();

    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ overwrite: true }));
    const written = JSON.parse(mockWrite.mock.calls[0][0]);
    expect(written.appVersion).toBe('1.2.3');
    expect(typeof written.exportedAt).toBe('number');
    expect(written.device).toEqual({ platform: expect.any(String), osVersion: '14', manufacturer: 'Xiaomi', modelName: 'Redmi Note 12' });
    expect(written.permissions).toEqual({
      smsCaptureSupported: true,
      sms: true,
      smsCanAskAgain: true,
      notifications: false,
      notificationsCanAskAgain: true,
    });
    expect(written.pipelineHealth).toEqual({
      lastRealtimeInvokedAt: 1_700_000_000_000,
      lastReconcileSweepAt: 1_700_000_100_000,
      lastReconcileMatchCount: 2,
      lastStoreTriggerAt: 1_700_000_200_000,
      caughtBy: { broadcast: 5, storeTrigger: 2, sweepOpen: 1, sweepPeriodic: 0 },
    });
    expect(written.crashReportingEnabled).toBe(true);
    expect(written.recentLogs).toEqual([{ ts: 1, level: 'error', op: 'x', name: 'Error', message: 'boom' }]);
  });

  it('hands the written file to the OS share sheet as JSON', async () => {
    await sendDiagnostics();
    expect(mockShareAsync).toHaveBeenCalledWith('file:///cache/mock', expect.objectContaining({ mimeType: 'application/json' }));
  });

  it('rejects (E21) without sharing when the share sheet itself fails', async () => {
    mockShareAsync.mockRejectedValueOnce(new Error('share failed'));
    await expect(sendDiagnostics()).rejects.toThrow('share failed');
  });

  it('never includes null pipeline-health fields as SMS content — falls back to null when unset', async () => {
    mockGetSetting.mockImplementation((_key: string, fallback: unknown) => fallback);
    await sendDiagnostics();
    const written = JSON.parse(mockWrite.mock.calls[0][0]);
    expect(written.pipelineHealth).toEqual({
      lastRealtimeInvokedAt: null,
      lastReconcileSweepAt: null,
      lastReconcileMatchCount: null,
      lastStoreTriggerAt: null,
      caughtBy: { broadcast: 5, storeTrigger: 2, sweepOpen: 1, sweepPeriodic: 0 },
    });
  });
});
