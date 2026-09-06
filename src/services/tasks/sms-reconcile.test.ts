/**
 * `reconcileMissedSms` (§17.8/§17.9, CR-10/CR-11). Mocks `@/services/sms` and `./sms-ingest` —
 * asserts the sweep's own gating/wiring and `notify` forwarding, not `smsIngestTask`'s pipeline
 * (that's `sms-ingest.test.ts`'s job).
 */

import { getRecentSmsMessages, isSmsCaptureSupported } from '@/services/sms';

import { reconcileMissedSms } from './sms-reconcile';
import { smsIngestTask } from './sms-ingest';

jest.mock('@/services/sms', () => ({
  isSmsCaptureSupported: jest.fn().mockReturnValue(true),
  getRecentSmsMessages: jest.fn().mockResolvedValue([]),
}));
jest.mock('./sms-ingest', () => ({ smsIngestTask: jest.fn().mockResolvedValue(undefined) }));

const isSmsCaptureSupportedMock = isSmsCaptureSupported as jest.Mock;
const getRecentSmsMessagesMock = getRecentSmsMessages as jest.Mock;
const smsIngestTaskMock = smsIngestTask as jest.Mock;

const MESSAGE = { sender: 'AD-PNBSMS-S', body: 'A/c credited for INR 1.00.', timestampMs: 1_700_000_000_000 };

beforeEach(() => {
  jest.clearAllMocks();
  isSmsCaptureSupportedMock.mockReturnValue(true);
  getRecentSmsMessagesMock.mockResolvedValue([]);
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
    expect(smsIngestTaskMock).toHaveBeenNthCalledWith(1, MESSAGE, { notify: false });
    expect(smsIngestTaskMock).toHaveBeenNthCalledWith(2, second, { notify: false });
  });

  it('forwards notify:true for the periodic-backstop call site', async () => {
    getRecentSmsMessagesMock.mockResolvedValue([MESSAGE]);
    await reconcileMissedSms({ notify: true });
    expect(smsIngestTaskMock).toHaveBeenCalledWith(MESSAGE, { notify: true });
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
});
