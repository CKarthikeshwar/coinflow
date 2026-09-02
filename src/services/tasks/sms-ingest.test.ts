/**
 * `SMS_INGEST_TASK` gate test (IMP-001 / IMP-002, traceability seed row §34.4). Mocks the DB
 * layer — no real `expo-sqlite` instance — and asserts the *gating* behavior: a qualifying SMS
 * writes exactly one Suggestion, a non-qualifying one writes nothing.
 */

import { ensureMigrated } from '@/db/maintenance';
import { insertIfNew } from '@/db/repositories/suggestions';

import { smsIngestTask } from './sms-ingest';

jest.mock('@/db/maintenance', () => ({ ensureMigrated: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/db/repositories/suggestions', () => ({
  insertIfNew: jest.fn().mockReturnValue({ created: true, id: 'test-id' }),
}));

const insertIfNewMock = insertIfNew as jest.Mock;
const ensureMigratedMock = ensureMigrated as jest.Mock;

beforeEach(() => {
  insertIfNewMock.mockClear();
  ensureMigratedMock.mockClear();
});

describe('smsIngestTask — IMP-001 (qualifying SMS)', () => {
  it('creates exactly one Suggestion for a qualifying SMS', async () => {
    await smsIngestTask({
      sender: 'AD-HDFCBK-S',
      body: 'Rs.450.00 debited from A/c XX1234 to VPA merchant@okhdfcbank UPI Ref 402812345678.',
      timestampMs: 1_700_000_000_000,
    });

    expect(insertIfNewMock).toHaveBeenCalledTimes(1);
    expect(insertIfNewMock).toHaveBeenCalledWith(
      expect.objectContaining({
        amountMinor: 45000,
        direction: 'debit',
        account: 'merchant@okhdfcbank',
        smsSender: 'AD-HDFCBK-S',
        smsReceivedAt: 1_700_000_000_000,
        dedupeKey: expect.any(String),
      }),
    );
  });

  it('runs migrations before writing', async () => {
    await smsIngestTask({
      sender: 'AD-HDFCBK-S',
      body: 'Rs.450.00 debited from A/c XX1234 to VPA merchant@okhdfcbank UPI Ref 402812345678.',
      timestampMs: 1_700_000_000_000,
    });
    expect(ensureMigratedMock).toHaveBeenCalled();
  });
});

describe('smsIngestTask — IMP-002 (non-qualifying SMS)', () => {
  it('creates no Suggestion for an unknown sender', async () => {
    await smsIngestTask({
      sender: 'AD-RANDOM-S',
      body: 'Rs.450.00 debited from A/c XX1234 to VPA merchant@okhdfcbank UPI Ref 1.',
      timestampMs: 1_700_000_000_000,
    });
    expect(insertIfNewMock).not.toHaveBeenCalled();
  });

  it('creates no Suggestion for an OTP message', async () => {
    await smsIngestTask({
      sender: 'AD-HDFCBK-S',
      body: '453298 is your OTP for the transaction of Rs.4,500.00. Do not share this OTP.',
      timestampMs: 1_700_000_000_000,
    });
    expect(insertIfNewMock).not.toHaveBeenCalled();
  });

  it('creates no Suggestion for a balance-only message', async () => {
    await smsIngestTask({
      sender: 'AD-SBIINB-S',
      body: 'Your A/c XX5678 Avl Bal is Rs.12,340.00 as of 05-09-26.',
      timestampMs: 1_700_000_000_000,
    });
    expect(insertIfNewMock).not.toHaveBeenCalled();
  });

  it('creates no Suggestion and never touches the DB for an empty payload', async () => {
    await smsIngestTask(undefined);
    await smsIngestTask({ sender: '', body: '', timestampMs: 0 });
    expect(insertIfNewMock).not.toHaveBeenCalled();
    expect(ensureMigratedMock).not.toHaveBeenCalled();
  });

  it('never throws even if the repository layer throws', async () => {
    insertIfNewMock.mockImplementationOnce(() => {
      throw new Error('disk full');
    });
    await expect(
      smsIngestTask({
        sender: 'AD-HDFCBK-S',
        body: 'Rs.450.00 debited from A/c XX1234 to VPA merchant@okhdfcbank UPI Ref 1.',
        timestampMs: 1_700_000_000_000,
      }),
    ).resolves.toBeUndefined();
  });
});
