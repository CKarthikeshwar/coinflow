/**
 * `SMS_INGEST_TASK` gate test (IMP-001 / IMP-002, traceability seed row §34.4). Mocks the DB
 * layer — no real `expo-sqlite` instance — and asserts the *gating* behavior: a qualifying SMS
 * writes exactly one Suggestion, a non-qualifying one writes nothing. Notification posting
 * (`post.ts` / `reconcile.ts`) is mocked out here too — it has its own tests.
 */

import { getAccountRule } from '@/db/repositories/account-rules';
import { listCardLast4s, resolveAccountFromSms } from '@/db/repositories/accounts';
import { recordCardBillHint } from '@/db/repositories/transfers';
import { ensureMigrated } from '@/db/maintenance';
import { getSuggestion, insertIfNew } from '@/db/repositories/suggestions';
import { hasDedupeKey } from '@/db/repositories/transactions';
import { postForSuggestion } from '@/services/notifications/post';
import { reconcileNotifications } from '@/services/notifications/reconcile';
import { handleIncomingRequest } from '@/services/splits/receive-request';


import { recordCatch } from './catch-stats';
import { smsIngestTask } from './sms-ingest';

jest.mock('@/db/maintenance', () => ({ ensureMigrated: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/db/repositories/account-rules', () => ({
  getAccountRule: jest.fn().mockReturnValue(null),
}));
jest.mock('@/db/repositories/accounts', () => ({
  resolveAccountFromSms: jest.fn().mockReturnValue({ id: 'acc-hdfc', created: true }),
  listCardLast4s: jest.fn().mockReturnValue([]),
  updateCardDue: jest.fn().mockReturnValue(true),
}));
jest.mock('@/services/notifications/card-bill-reminder', () => ({ scheduleCardBillReminders: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/db/repositories/transfers', () => ({ recordCardBillHint: jest.fn() }));
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
jest.mock('./catch-stats', () => ({ recordCatch: jest.fn() }));
jest.mock('@/services/splits/receive-request', () => ({ handleIncomingRequest: jest.fn().mockResolvedValue(false) }));
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
const recordCatchMock = recordCatch as jest.Mock;
const handleIncomingRequestMock = handleIncomingRequest as jest.Mock;

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
  (resolveAccountFromSms as jest.Mock).mockReturnValue({ id: 'acc-hdfc', created: true });
  (listCardLast4s as jest.Mock).mockReturnValue([]);
});

describe('smsIngestTask — own account (§46.5, CR-34)', () => {
  it('resolves the account the SMS names and stores it on the suggestion', async () => {
    await smsIngestTask(QUALIFYING_SMS);
    expect(resolveAccountFromSms).toHaveBeenCalledWith({ bankKey: 'hdfc', bankName: 'HDFC Bank', last4: '1234', kind: 'bank' });
    expect(insertIfNewMock).toHaveBeenCalledWith(expect.objectContaining({ accountId: 'acc-hdfc' }));
  });

  it('no account in the SMS ⇒ accountId null, nothing created', async () => {
    await smsIngestTask({ ...QUALIFYING_SMS, body: 'Rs.450.00 debited to VPA merchant@okhdfcbank UPI Ref 4.' });
    expect(resolveAccountFromSms).not.toHaveBeenCalled();
    expect(insertIfNewMock).toHaveBeenCalledWith(expect.objectContaining({ accountId: null }));
  });

  it('an ignored SMS never creates an account', async () => {
    await smsIngestTask({ ...QUALIFYING_SMS, body: 'Dear Customer, your Avl Bal is Rs.12,340.00.' }); // names no account
    expect(resolveAccountFromSms).not.toHaveBeenCalled();
  });

  it('a duplicate SMS never creates an account', async () => {
    hasDedupeKeyMock.mockReturnValue(true);
    await smsIngestTask(QUALIFYING_SMS);
    expect(resolveAccountFromSms).not.toHaveBeenCalled();
  });

  it('an account failure still saves the suggestion, with no account', async () => {
    (resolveAccountFromSms as jest.Mock).mockImplementation(() => {
      throw new Error('boom');
    });
    await smsIngestTask(QUALIFYING_SMS);
    expect(insertIfNewMock).toHaveBeenCalledWith(expect.objectContaining({ accountId: null }));
  });

  it('a card spend with no method word is a card payment', async () => {
    (resolveAccountFromSms as jest.Mock).mockReturnValue({ id: 'acc-card', created: false });
    await smsIngestTask({ ...QUALIFYING_SMS, body: 'Rs.500.00 debited on Credit Card XX4321 at SHOP.' });
    expect(insertIfNewMock).toHaveBeenCalledWith(expect.objectContaining({ accountId: 'acc-card' }));
  });

  it('records a card-bill hint when a bank debit pays one of your cards (UI-108)', async () => {
    (listCardLast4s as jest.Mock).mockReturnValue([{ id: 'acc-card', last4: '4321' }]);
    await smsIngestTask({
      ...QUALIFYING_SMS,
      body: 'Rs.14,200.00 debited from A/c XX1234 towards HDFC Bank Credit Card XX4321 payment.',
    });
    expect(recordCardBillHint).toHaveBeenCalledWith(expect.any(String), 'acc-card');
  });

  it('no hint for an ordinary debit', async () => {
    (listCardLast4s as jest.Mock).mockReturnValue([{ id: 'acc-card', last4: '4321' }]);
    await smsIngestTask(QUALIFYING_SMS);
    expect(recordCardBillHint).not.toHaveBeenCalled();
  });
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

  it('counts a new catch under the default broadcast path (CR-16)', async () => {
    await smsIngestTask(QUALIFYING_SMS);
    expect(recordCatchMock).toHaveBeenCalledWith('broadcast');
  });

  it('counts a new catch under the path that was passed in', async () => {
    await smsIngestTask(QUALIFYING_SMS, { source: 'storeTrigger' });
    expect(recordCatchMock).toHaveBeenCalledWith('storeTrigger');
  });

  it('does not re-notify a retry of an already-recorded suggestion', async () => {
    insertIfNewMock.mockReturnValue({ created: false, id: 'existing-id' });
    await smsIngestTask(QUALIFYING_SMS);
    expect(getSuggestionMock).not.toHaveBeenCalled();
    expect(postForSuggestionMock).not.toHaveBeenCalled();
    // A dedupe no-op is not a new catch.
    expect(recordCatchMock).not.toHaveBeenCalled();
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

describe('smsIngestTask — notify: false (§17.9, CR-11)', () => {
  it('still writes the Suggestion and looks up the rule, but skips post + self-heal', async () => {
    await smsIngestTask(QUALIFYING_SMS, { notify: false });
    expect(insertIfNewMock).toHaveBeenCalledTimes(1);
    expect(getAccountRuleMock).toHaveBeenCalledWith('merchant@okhdfcbank');
    expect(postForSuggestionMock).not.toHaveBeenCalled();
    expect(reconcileNotificationsMock).not.toHaveBeenCalled();
  });

  it('defaults to notify: true when no options are given', async () => {
    await smsIngestTask(QUALIFYING_SMS);
    expect(postForSuggestionMock).toHaveBeenCalledTimes(1);
    expect(reconcileNotificationsMock).toHaveBeenCalledTimes(1);
  });
});

describe('smsIngestTask — V2 request branch (§42.2, IMP-079)', () => {
  it('offers every message to the request branch first, with the sender, body and notify flag', async () => {
    await smsIngestTask(QUALIFYING_SMS, { notify: false });
    expect(handleIncomingRequestMock).toHaveBeenCalledWith(
      { sender: QUALIFYING_SMS.sender, body: QUALIFYING_SMS.body },
      { notify: false },
    );
  });

  it('a message the request branch handled stops there — never a bank Suggestion, never the sender gate', async () => {
    handleIncomingRequestMock.mockResolvedValueOnce(true);
    await smsIngestTask({ ...QUALIFYING_SMS, sender: '+919845897555' });
    expect(insertIfNewMock).not.toHaveBeenCalled();
    expect(postForSuggestionMock).not.toHaveBeenCalled();
    expect(recordCatchMock).not.toHaveBeenCalled();
  });

  it('even a bank-looking body from a request sender is not parsed once handled', async () => {
    handleIncomingRequestMock.mockResolvedValueOnce(true);
    await smsIngestTask({ sender: 'AD-HDFCBK-S', body: QUALIFYING_SMS.body });
    expect(insertIfNewMock).not.toHaveBeenCalled();
  });

  it('an unhandled message carries on exactly as in V1', async () => {
    await smsIngestTask(QUALIFYING_SMS);
    expect(insertIfNewMock).toHaveBeenCalledTimes(1);
  });

  it('never throws if the request branch throws', async () => {
    handleIncomingRequestMock.mockRejectedValueOnce(new TypeError('boom'));
    await expect(smsIngestTask(QUALIFYING_SMS)).resolves.toBeUndefined();
  });
});


describe('smsIngestTask — balances and card bills (§46.5, phase D / E)', () => {
  const accounts = jest.requireMock('@/db/repositories/accounts') as { updateCardDue: jest.Mock; resolveAccountFromSms: jest.Mock };
  const reminders = jest.requireMock('@/services/notifications/card-bill-reminder') as { scheduleCardBillReminders: jest.Mock };

  it('a transaction with "Avl Bal" is still saved as a suggestion; the bank\'s balance is not stored (D50 / CR-41)', async () => {
    await smsIngestTask({ ...QUALIFYING_SMS, body: 'Rs.450.00 debited from A/c XX1234 to VPA m@okhdfcbank. Avl Bal Rs.9,550.00' });
    expect(insertIfNewMock).toHaveBeenCalledTimes(1);
  });

  it('a balance-only text about your account: the account is resolved, no suggestion, no notification', async () => {
    accounts.resolveAccountFromSms.mockClear();
    await smsIngestTask({ ...QUALIFYING_SMS, body: 'Your A/c XX1234 Avl Bal is Rs.12,340.00 as of 20-10-26.' });
    expect(accounts.resolveAccountFromSms).toHaveBeenCalledTimes(1);
    expect(insertIfNewMock).not.toHaveBeenCalled();
    expect(postForSuggestionMock).not.toHaveBeenCalled();
  });

  it('a card statement updates the due date and re-plans the reminders', async () => {
    await smsIngestTask({
      ...QUALIFYING_SMS,
      body: 'Your HDFC Bank Credit Card XX4321 statement: Total due Rs.14,200.00, due date 05-Nov-26.',
    });
    expect(accounts.updateCardDue).toHaveBeenCalledWith('acc-hdfc', { amountMinor: 1420000, dueAt: new Date(2026, 10, 5).getTime() });
    expect(reminders.scheduleCardBillReminders).toHaveBeenCalled();
    expect(insertIfNewMock).not.toHaveBeenCalled();
  });

  it('an unchanged due date does not re-plan', async () => {
    accounts.updateCardDue.mockReturnValueOnce(false);
    await smsIngestTask({ ...QUALIFYING_SMS, body: 'HDFC Credit Card XX4321: Total due Rs.14,200.00, due date 05-Nov-26.' });
    expect(reminders.scheduleCardBillReminders).not.toHaveBeenCalled();
  });

  it('a due-date write failure never drops the transaction', async () => {
    accounts.updateCardDue.mockImplementationOnce(() => {
      throw new Error('db');
    });
    await smsIngestTask({ ...QUALIFYING_SMS, body: 'Rs.450.00 debited from A/c XX1234 to VPA m@okhdfcbank. Total due Rs.14,200.00, due date 05-Nov-26.' });
    expect(insertIfNewMock).toHaveBeenCalledTimes(1);
  });
});
