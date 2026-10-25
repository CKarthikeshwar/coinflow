/**
 * `reconcileMissedSms` (§17.8/§17.9, CR-10/CR-11). Mocks `@/services/sms` and `./sms-ingest` —
 * asserts the sweep's own gating/wiring and `notify` forwarding, not `smsIngestTask`'s pipeline
 * (that's `sms-ingest.test.ts`'s job).
 */

import { ensureMigrated } from '@/db/maintenance';
import { getSetting, setSetting } from '@/db/repositories/settings';
import { getRecentSmsMessages, isSmsCaptureSupported } from '@/services/sms';

import { reconcileMissedSms } from './sms-reconcile';
import { smsIngestTask } from './sms-ingest';

jest.mock('@/services/sms', () => ({
  isSmsCaptureSupported: jest.fn().mockReturnValue(true),
  getRecentSmsMessages: jest.fn().mockResolvedValue([]),
}));
jest.mock('./sms-ingest', () => ({ smsIngestTask: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/db/repositories/settings', () => ({ setSetting: jest.fn(), getSetting: jest.fn() }));
jest.mock('@/db/maintenance', () => ({ ensureMigrated: jest.fn().mockResolvedValue(undefined) }));

const isSmsCaptureSupportedMock = isSmsCaptureSupported as jest.Mock;
const getRecentSmsMessagesMock = getRecentSmsMessages as jest.Mock;
const smsIngestTaskMock = smsIngestTask as jest.Mock;
const setSettingMock = setSetting as jest.Mock;
const getSettingMock = getSetting as jest.Mock;

const MESSAGE = { sender: 'AD-PNBSMS-S', body: 'A/c credited for INR 1.00.', timestampMs: 1_700_000_000_000 };

beforeEach(() => {
  jest.clearAllMocks();
  isSmsCaptureSupportedMock.mockReturnValue(true);
  getRecentSmsMessagesMock.mockResolvedValue([]);
  // An install old enough to never clamp the lookback window, unless a test says otherwise.
  getSettingMock.mockReturnValue(0);
});

describe('reconcileMissedSms', () => {
  it('does nothing where SMS capture is unsupported', async () => {
    isSmsCaptureSupportedMock.mockReturnValue(false);
    await reconcileMissedSms({ notify: false });
    expect(getRecentSmsMessagesMock).not.toHaveBeenCalled();
    expect(smsIngestTaskMock).not.toHaveBeenCalled();
  });

  it('queries a 48h lookback window', async () => {
    const now = 1_800_000_000_000;
    jest.spyOn(Date, 'now').mockReturnValue(now);
    await reconcileMissedSms({ notify: false });
    expect(getRecentSmsMessagesMock).toHaveBeenCalledWith(now - 48 * 60 * 60 * 1000);
  });

  it('runs every returned message through smsIngestTask, in order, forwarding notify:false', async () => {
    const second = { ...MESSAGE, sender: 'AD-HSBCIN-S' };
    getRecentSmsMessagesMock.mockResolvedValue([MESSAGE, second]);
    await reconcileMissedSms({ notify: false });
    expect(smsIngestTaskMock).toHaveBeenNthCalledWith(1, MESSAGE, { notify: false, source: 'sweepOpen' });
    expect(smsIngestTaskMock).toHaveBeenNthCalledWith(2, second, { notify: false, source: 'sweepOpen' });
  });

  it('forwards notify:true for the periodic-backstop call site', async () => {
    getRecentSmsMessagesMock.mockResolvedValue([MESSAGE]);
    await reconcileMissedSms({ notify: true });
    expect(smsIngestTaskMock).toHaveBeenCalledWith(MESSAGE, { notify: true, source: 'sweepPeriodic' });
  });

  it('tags each message with the trigger that ran the sweep (CR-16 catch counters)', async () => {
    getRecentSmsMessagesMock.mockResolvedValue([MESSAGE]);
    await reconcileMissedSms({ notify: true, source: 'storeTrigger' });
    expect(smsIngestTaskMock).toHaveBeenCalledWith(MESSAGE, { notify: true, source: 'storeTrigger' });
  });

  it('honours a shorter lookback window (the store-watcher re-reads only recent messages)', async () => {
    const now = 1_800_000_000_000;
    jest.spyOn(Date, 'now').mockReturnValue(now);
    await reconcileMissedSms({ notify: true, source: 'storeTrigger', lookbackMs: 6 * 60 * 60 * 1000 });
    expect(getRecentSmsMessagesMock).toHaveBeenCalledWith(now - 6 * 60 * 60 * 1000);
  });

  it('never reaches back further than this install has existed (a fresh reinstall must not resurrect old SMS)', async () => {
    const now = 1_800_000_000_000;
    const installedAt = now - 60 * 60 * 1000; // 1h ago — inside the default 48h window
    jest.spyOn(Date, 'now').mockReturnValue(now);
    getSettingMock.mockReturnValue(installedAt);
    await reconcileMissedSms({ notify: false });
    expect(getRecentSmsMessagesMock).toHaveBeenCalledWith(installedAt);
  });

  it('does not clamp a long-lived install — the requested window still wins', async () => {
    const now = 1_800_000_000_000;
    getSettingMock.mockReturnValue(now - 365 * 86_400_000); // installed a year ago
    jest.spyOn(Date, 'now').mockReturnValue(now);
    await reconcileMissedSms({ notify: false });
    expect(getRecentSmsMessagesMock).toHaveBeenCalledWith(now - 48 * 60 * 60 * 1000);
  });

  it('runs migrations first — a background trigger can beat the UI to the database', async () => {
    await reconcileMissedSms({ notify: false });
    expect(ensureMigrated as jest.Mock).toHaveBeenCalled();
  });

  it('never throws if the native query rejects', async () => {
    getRecentSmsMessagesMock.mockRejectedValue(new Error('inbox query failed'));
    await expect(reconcileMissedSms({ notify: false })).resolves.toBeUndefined();
    expect(smsIngestTaskMock).not.toHaveBeenCalled();
  });

  it('never throws if smsIngestTask itself rejects', async () => {
    getRecentSmsMessagesMock.mockResolvedValue([MESSAGE]);
    smsIngestTaskMock.mockRejectedValueOnce(new Error('boom'));
    await expect(reconcileMissedSms({ notify: false })).resolves.toBeUndefined();
  });

  describe('pipeline health stamping (§17.10, CR-12)', () => {
    it('records the sweep timestamp and match count on a successful fetch', async () => {
      const now = 1_800_000_000_000;
      jest.spyOn(Date, 'now').mockReturnValue(now);
      getRecentSmsMessagesMock.mockResolvedValue([MESSAGE, MESSAGE]);
      await reconcileMissedSms({ notify: false });
      expect(setSettingMock).toHaveBeenCalledWith('smsLastReconcileSweepAt', now);
      expect(setSettingMock).toHaveBeenCalledWith('smsLastReconcileMatchCount', 2);
    });

    it('does not stamp anything if the fetch itself rejects', async () => {
      getRecentSmsMessagesMock.mockRejectedValue(new Error('inbox query failed'));
      await reconcileMissedSms({ notify: false });
      expect(setSettingMock).not.toHaveBeenCalled();
    });
  });
});
