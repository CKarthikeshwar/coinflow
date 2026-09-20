import { Linking } from 'react-native';

import { findOrCreatePerson } from '@/db/repositories/persons';
import { setSetting } from '@/db/repositories/settings';
import { settle } from '@/db/repositories/settlements';
import { createSplit, getSplit, replaceShares, waiveShare } from '@/db/repositories/splits';
import { insertTransaction } from '@/db/test-support/fixtures';
import { createMemoryDb } from '@/db/test-support/memory-db';
import { decodeRequest } from '@/domain/split-message';

import { canRequest, needsRequest, openInSmsApp, sendRequests, summarizeReport } from './send-requests';

let mockMem: ReturnType<typeof createMemoryDb>;
let mockCounter = 0;
jest.mock('@/db/client', () => ({
  get db() {
    return mockMem.db;
  },
}));
jest.mock('expo-crypto', () => ({
  randomUUID: () => `id-${++mockCounter}`,
  getRandomBytes: (n: number) => Uint8Array.from({ length: n }, (_v, i) => (mockCounter * 41 + i * 13 + 7) % 256),
}));

const mockSendSms = jest.fn(async (..._a: unknown[]): Promise<'sent' | 'failed'> => 'sent');
const mockGetPerm = jest.fn(async () => ({ granted: true, canAskAgain: true }));
const mockRequestPerm = jest.fn(async () => ({ granted: true, canAskAgain: true }));
jest.mock('@/services/sms', () => ({
  sendSms: (...a: unknown[]) => mockSendSms(...a),
  getSendSmsPermission: () => mockGetPerm(),
  requestSendSmsPermission: () => mockRequestPerm(),
}));

const db = () => mockMem.db;
const person = (name: string, phone: string) => findOrCreatePerson({ displayName: name, phone, source: 'manual' }, 50);

/** ₹1,200 "Dinner" split with Rahul and Priya at ₹400 each. */
function dinner() {
  const txn = insertTransaction(db(), { amountMinor: 120_000, note: 'Dinner' });
  const rahul = person('Rahul', '9845897555');
  const priya = person('Priya', '9742590888');
  const v = createSplit({
    transactionId: txn.id,
    shares: [
      { personId: rahul.id, amountMinor: 40_000 },
      { personId: priya.id, amountMinor: 40_000 },
    ],
  });
  return { txn, v, rahul, priya };
}

beforeEach(() => {
  mockMem?.close();
  mockMem = createMemoryDb();
  mockCounter = 0;
  mockSendSms.mockReset().mockResolvedValue('sent');
  mockGetPerm.mockReset().mockResolvedValue({ granted: true, canAskAgain: true });
  mockRequestPerm.mockReset().mockResolvedValue({ granted: true, canAskAgain: true });
  jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
});

describe('sending (IMP-081)', () => {
  it('sends one request per person, sequentially, and records each result on the share', async () => {
    const { v } = dinner();
    const report = await sendRequests(v.split.id);
    expect(report.results.map((r) => [r.personName, r.state])).toEqual([['Rahul', 'sent'], ['Priya', 'sent']]);
    expect(mockSendSms).toHaveBeenCalledTimes(2);
    const shares = getSplit(v.split.id)!.shares;
    expect(shares.every((s) => s.requestState === 'sent' && s.requestSentAt !== null && s.requestedAmountMinor === 40_000)).toBe(true);
  });

  it('the text is a real request: the right number, the split ref, this share’s amount and the note (§42.1)', async () => {
    const { v } = dinner();
    await sendRequests(v.split.id);
    const [phone, text] = mockSendSms.mock.calls[0] as [string, string];
    expect(phone).toBe('+919845897555');
    expect(decodeRequest(text)).toEqual({ ref: v.split.ref, amountMinor: 40_000, note: 'Dinner' });
  });

  it('puts your name in the request when the setting is on', async () => {
    const { v } = dinner();
    setSetting('splitYourName', 'Karthik');
    await sendRequests(v.split.id);
    expect((mockSendSms.mock.calls[0] as [string, string])[1]).toMatch(/^Karthik requests Rs 400\.00 for Dinner/);
  });

  it('a failed send is recorded as failed and never stops the others', async () => {
    const { v } = dinner();
    mockSendSms.mockResolvedValueOnce('failed').mockResolvedValueOnce('sent');
    const report = await sendRequests(v.split.id);
    expect(report.results.map((r) => r.state)).toEqual(['failed', 'sent']);
    const shares = getSplit(v.split.id)!.shares;
    expect(shares[0]).toMatchObject({ requestState: 'failed', requestSentAt: null });
    expect(shares[1].requestState).toBe('sent');
  });

  it('a send that throws is a failure, not a crash', async () => {
    const { v } = dinner();
    mockSendSms.mockRejectedValueOnce(new Error('boom'));
    const report = await sendRequests(v.split.id);
    expect(report.results[0].state).toBe('failed');
  });

  it('skips waived and settled shares and people with no number', async () => {
    const { v, txn } = dinner();
    const noNumber = findOrCreatePerson({ displayName: 'Ghost', phone: null, source: 'manual' }, 60);
    replaceShares(v.split.id, [
      ...v.shares.map((s) => ({ personId: s.personId, amountMinor: s.amountMinor })),
      { personId: noNumber.id, amountMinor: 10_000 },
    ]);
    waiveShare(v.shares[0].id);
    settle({ transactionId: insertTransaction(db(), { direction: 'credit', type: 'income', amountMinor: 40_000 }).id, picks: [{ shareId: v.shares[1].id }] });
    const report = await sendRequests(v.split.id);
    expect(report).toEqual({ results: [], fallback: [] });
    expect(mockSendSms).not.toHaveBeenCalled();
    expect(txn.id).toBeTruthy();
  });

  it('by default only shares that still need one; force resends a chosen one (Resend / reminder)', async () => {
    const { v } = dinner();
    await sendRequests(v.split.id);
    mockSendSms.mockClear();
    expect((await sendRequests(v.split.id)).results).toEqual([]); // both already sent
    const forced = await sendRequests(v.split.id, { shareIds: [v.shares[1].id], force: true });
    expect(forced.results.map((r) => r.personName)).toEqual(['Priya']);
    expect(mockSendSms).toHaveBeenCalledTimes(1);
  });

  it('a changed amount makes the request needed again, and the resend carries the new amount', async () => {
    const { v } = dinner();
    await sendRequests(v.split.id);
    mockSendSms.mockClear();
    replaceShares(v.split.id, [
      { personId: v.shares[0].personId, amountMinor: 50_000 },
      { personId: v.shares[1].personId, amountMinor: 40_000 },
    ]);
    const view = getSplit(v.split.id)!;
    expect(view.shares.map(needsRequest)).toEqual([true, false]);
    await sendRequests(v.split.id);
    expect(mockSendSms).toHaveBeenCalledTimes(1);
    expect(decodeRequest((mockSendSms.mock.calls[0] as [string, string])[1])?.amountMinor).toBe(50_000);
  });

  it('canRequest is true for open shares with a number, false for waived ones', () => {
    const { v } = dinner();
    waiveShare(v.shares[0].id);
    const shares = getSplit(v.split.id)!.shares;
    expect(shares.map(canRequest)).toEqual([false, true]);
  });
});

describe('SEND_SMS is asked just-in-time; refusing it falls back to the SMS app (§6.17)', () => {
  it('asks for the permission when it is not granted yet, then sends', async () => {
    const { v } = dinner();
    mockGetPerm.mockResolvedValue({ granted: false, canAskAgain: true });
    const report = await sendRequests(v.split.id);
    expect(mockRequestPerm).toHaveBeenCalledTimes(1);
    expect(report.results).toHaveLength(2);
  });

  it('refused ⇒ nothing is sent silently; the recipients come back as the fallback list', async () => {
    const { v } = dinner();
    mockGetPerm.mockResolvedValue({ granted: false, canAskAgain: true });
    mockRequestPerm.mockResolvedValue({ granted: false, canAskAgain: true });
    const report = await sendRequests(v.split.id);
    expect(mockSendSms).not.toHaveBeenCalled();
    expect(report.results).toEqual([]);
    expect(report.fallback.map((f) => f.personName)).toEqual(['Rahul', 'Priya']);
    expect(getSplit(v.split.id)!.shares.every((s) => s.requestState === 'not_sent')).toBe(true); // split kept, request not sent
  });

  it('permanently denied ⇒ does not even prompt again', async () => {
    const { v } = dinner();
    mockGetPerm.mockResolvedValue({ granted: false, canAskAgain: false });
    const report = await sendRequests(v.split.id);
    expect(mockRequestPerm).not.toHaveBeenCalled();
    expect(report.fallback).toHaveLength(2);
  });

  it('openInSmsApp opens a pre-filled message and records "opened in Messages"', async () => {
    const { v } = dinner();
    const res = await openInSmsApp(v.split.id, v.shares[0].id);
    expect(res).toMatchObject({ personName: 'Rahul', state: 'opened_in_sms_app' });
    const url = (Linking.openURL as jest.Mock).mock.calls[0][0] as string;
    expect(url.startsWith('sms:+919845897555?body=')).toBe(true);
    expect(decodeRequest(decodeURIComponent(url.split('body=')[1]))?.amountMinor).toBe(40_000);
    expect(getSplit(v.split.id)!.shares[0].requestState).toBe('opened_in_sms_app');
  });

  it('openInSmsApp failing to open is recorded as failed; a waived share is not offered', async () => {
    const { v } = dinner();
    (Linking.openURL as jest.Mock).mockRejectedValueOnce(new Error('no app'));
    expect((await openInSmsApp(v.split.id, v.shares[0].id))?.state).toBe('failed');
    waiveShare(v.shares[1].id);
    expect(await openInSmsApp(v.split.id, v.shares[1].id)).toBeNull();
  });
});

describe('summarizeReport', () => {
  const r = (state: 'sent' | 'failed' | 'opened_in_sms_app') => ({ shareId: 's', personName: 'Rahul', phone: '+91', state });
  it('words each outcome for a one-line toast', () => {
    expect(summarizeReport({ results: [], fallback: [] })).toBeNull();
    expect(summarizeReport({ results: [r('sent')], fallback: [] })).toBe('Request sent to Rahul');
    expect(summarizeReport({ results: [r('sent'), r('sent')], fallback: [] })).toBe('Requests sent to 2 people');
    expect(summarizeReport({ results: [r('failed'), r('failed')], fallback: [] })).toBe('Sending failed — retry from Details');
    expect(summarizeReport({ results: [r('sent'), r('failed')], fallback: [] })).toBe('1 of 2 requests failed — retry from Details');
    expect(summarizeReport({ results: [], fallback: [{ shareId: 's', personName: 'R', phone: '+91' }] })).toMatch(/open each request in Messages/);
  });
});
