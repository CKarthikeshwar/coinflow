/**
 * `SMS_INGEST_TASK` gate test (IMP-001 / IMP-002, traceability seed row §34.4). Mocks the DB
 * layer — no real `expo-sqlite` instance — and asserts the *gating* behavior: a qualifying SMS
 * writes exactly one Suggestion, a non-qualifying one writes nothing. Notification posting
 * (`post.ts` / `reconcile.ts`) is mocked out here too — it has its own tests.
 */

import { getAccountRule } from '@/db/repositories/account-rules';
import { ensureMigrated } from '@/db/maintenance';
import { getSuggestion, insertIfNew } from '@/db/repositories/suggestions';
import { hasDedupeKey } from '@/db/repositories/transactions';
import { postForSuggestion } from '@/services/notifications/post';
import { reconcileNotifications } from '@/services/notifications/reconcile';

import { smsIngestTask } from './sms-ingest';

jest.mock('@/db/maintenance', () => ({ ensureMigrated: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/db/repositories/account-rules', () => ({
  getAccountRule: jest.fn().mockReturnValue(null),
}));
jest.mock('@/db/repositories/transactions', () => ({
  hasDedupeKey: jest.fn().mockReturnValue(false),
}));
jest.mock('@/db/repositories/suggestions', () => ({
  insertIfNew: jest.fn().mockReturnValue({ created: true, id: 'test-id' }),
  getSuggestion: jest.fn().mockReturnValue({
    id: 'test-id',
    amountMinor: 45000,
    direction: 'debit',
    occurredAt: 1_700_000_000_000,
    account: 'merchant@okhdfcbank',
    normalizedKey: 'merchant@okhdfcbank',
    paymentMethod: 'upi',
    smsSender: 'AD-HDFCBK-S',
    smsReceivedAt: 1_700_000_000_000,
    dedupeKey: 'dedupe-key',
    status: 'pending',
    confirmedTransactionId: null,
    createdAt: 1_700_000_000_000,
  }),
}));
jest.mock('@/services/notifications/post', () => ({
  postForSuggestion: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/services/notifications/reconcile', () => ({
  reconcileNotifications: jest.fn().mockResolvedValue(undefined),
}));

const insertIfNewMock = insertIfNew as jest.Mock;
const getSuggestionMock = getSuggestion as jest.Mock;
const ensureMigratedMock = ensureMigrated as jest.Mock;
const getAccountRuleMock = getAccountRule as jest.Mock;
const hasDedupeKeyMock = hasDedupeKey as jest.Mock;
const postForSuggestionMock = postForSuggestion as jest.Mock;
const reconcileNotificationsMock = reconcileNotifications as jest.Mock;

const QUALIFYING_SMS = {
  sender: 'AD-HDFCBK-S',
  body: 'Rs.450.00 debited from A/c XX1234 to VPA merchant@okhdfcbank UPI Ref 402812345678.',
  timestampMs: 1_700_000_000_000,
};

beforeEach(() => {
  jest.clearAllMocks();
  insertIfNewMock.mockReturnValue({ created: true, id: 'test-id' });
  hasDedupeKeyMock.mockReturnValue(false);
  getAccountRuleMock.mockReturnValue(null);
});

describe('smsIngestTask — IMP-001 (qualifying SMS)', () => {
  it('creates exactly one Suggestion for a qualifying SMS', async () => {
    await smsIngestTask(QUALIFYING_SMS);

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
    await smsIngestTask(QUALIFYING_SMS);
    expect(ensureMigratedMock).toHaveBeenCalled();
  });

  it('looks up the account rule and posts a notification for a newly-created suggestion', async () => {
    await smsIngestTask(QUALIFYING_SMS);
    expect(getAccountRuleMock).toHaveBeenCalledWith('merchant@okhdfcbank');
    expect(postForSuggestionMock).toHaveBeenCalledTimes(1);
    expect(reconcileNotificationsMock).toHaveBeenCalledTimes(1);
  });

  it('does not re-notify a retry of an already-recorded suggestion', async () => {
    insertIfNewMock.mockReturnValue({ created: false, id: 'existing-id' });
    await smsIngestTask(QUALIFYING_SMS);
    expect(getSuggestionMock).not.toHaveBeenCalled();
    expect(postForSuggestionMock).not.toHaveBeenCalled();
  });

  it('skips entirely when the dedupe key already exists on a Transaction', async () => {
    hasDedupeKeyMock.mockReturnValue(true);
    await smsIngestTask(QUALIFYING_SMS);
    expect(insertIfNewMock).not.toHaveBeenCalled();
    expect(postForSuggestionMock).not.toHaveBeenCalled();
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
    await expect(smsIngestTask(QUALIFYING_SMS)).resolves.toBeUndefined();
  });
});
