/**
 * The request branch of ingest (SPEC-implementation.md §42.2, IMP-079/080/082/088): real repositories on an
 * in-memory database, the notification layer mocked. The point of these tests is the *boundary* — what is and is
 * not a request — because a wrong answer either drops a real request or turns a bank SMS into one.
 */

import { acceptRequest, listRequestsByStatus } from '@/db/repositories/split-requests';
import { createMemoryDb } from '@/db/test-support/memory-db';
import { encodeRequest, encodeWithdraw } from '@/domain/split-message';

import { handleIncomingRequest } from './receive-request';

let mockMem: ReturnType<typeof createMemoryDb>;
let mockCounter = 0;
jest.mock('@/db/client', () => ({
  get db() {
    return mockMem.db;
  },
}));
jest.mock('@/db/maintenance', () => ({ ensureMigrated: jest.fn().mockResolvedValue(undefined) }));
jest.mock('expo-crypto', () => ({
  randomUUID: () => `id-${++mockCounter}`,
  getRandomBytes: (n: number) => Uint8Array.from({ length: n }, (_v, i) => (mockCounter * 41 + i * 13) % 256),
}));
const mockPost = jest.fn().mockResolvedValue(undefined);
const mockCancel = jest.fn().mockResolvedValue(undefined);
jest.mock('@/services/notifications/split-post', () => ({
  postForRequest: (...a: unknown[]) => mockPost(...a),
  cancelForRequest: (...a: unknown[]) => mockCancel(...a),
}));

const SENDER = '+919845897555';
const request = (o: { ref?: string; amountMinor?: number; note?: string } = {}) =>
  encodeRequest({ name: 'Rahul', ref: o.ref ?? 'ab2cd3', amountMinor: o.amountMinor ?? 45_000, note: o.note ?? 'Momos' });

beforeEach(() => {
  mockMem?.close();
  mockMem = createMemoryDb();
  mockCounter = 0;
  mockPost.mockClear();
  mockCancel.mockClear();
});

describe('what is a request', () => {
  it('a request text from a phone number is stored as Unattended and announced', async () => {
    expect(await handleIncomingRequest({ sender: SENDER, body: request() }, { notify: true })).toBe(true);
    const rows = listRequestsByStatus(['unattended']);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ fromPhoneKey: '9845897555', remoteRef: 'ab2cd3', amountMinor: 45_000, forNote: 'Momos' });
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('accepts the number in any of its usual spellings', async () => {
    for (const [i, sender] of ['9845897555', '+91 98458 97555', '09845897555'].entries()) {
      await handleIncomingRequest({ sender, body: request({ ref: `ab2cd${i + 2}` }) }, { notify: false });
    }
    expect(new Set(listRequestsByStatus(['unattended']).map((r) => r.fromPhoneKey))).toEqual(new Set(['9845897555']));
  });

  it('an alphanumeric sender (every bank) is NEVER a request, even with a perfect token (IMP-079)', async () => {
    for (const sender of ['AD-HDFCBK-S', 'VA-SBICRD-P', 'HSBCIN', 'JD-ICICIB', 'AMAZON']) {
      expect(await handleIncomingRequest({ sender, body: request() }, { notify: true })).toBe(false);
    }
    expect(listRequestsByStatus(['unattended'])).toEqual([]);
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('a short code is not a request', async () => {
    expect(await handleIncomingRequest({ sender: '56767', body: request() }, { notify: true })).toBe(false);
    expect(await handleIncomingRequest({ sender: '140000', body: request() }, { notify: true })).toBe(false);
  });

  it('a phone-number text that is not a request falls through to the normal path', async () => {
    for (const body of [
      'hey are you coming tonight?',
      'Rs 450.00 debited from your A/c XX1234',
      '{cf1|ab2cd3|45000|x',
      '{cf2|ab2cd3|45000|x}',
      '{cf1|AB2CD3|45000|x}',
      '{cf1|ab2cd3|-5|x}',
      '',
    ]) {
      expect(await handleIncomingRequest({ sender: SENDER, body }, { notify: true })).toBe(false);
    }
    expect(listRequestsByStatus(['unattended'])).toEqual([]);
  });

  it('an out-of-bounds amount is not a request (1 paise over the ₹10 lakh ceiling)', async () => {
    const tooBig = '{cf1|ab2cd3|100000001|x}';
    expect(await handleIncomingRequest({ sender: SENDER, body: tooBig }, { notify: true })).toBe(false);
    expect(listRequestsByStatus(['unattended'])).toEqual([]);
    expect(mockPost).not.toHaveBeenCalled();
  });
});

describe('idempotency, updates and withdrawal (IMP-080)', () => {
  it('the same request seen twice (broadcast, then a sweep) is one row and one notification', async () => {
    await handleIncomingRequest({ sender: SENDER, body: request() }, { notify: true });
    await handleIncomingRequest({ sender: SENDER, body: request() }, { notify: true });
    expect(listRequestsByStatus(['unattended'])).toHaveLength(1);
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('a changed amount updates the row and refreshes the same notification', async () => {
    await handleIncomingRequest({ sender: SENDER, body: request({ amountMinor: 45_000 }) }, { notify: true });
    await handleIncomingRequest({ sender: SENDER, body: request({ amountMinor: 30_000 }) }, { notify: true });
    const rows = listRequestsByStatus(['unattended']);
    expect(rows).toHaveLength(1);
    expect(rows[0].amountMinor).toBe(30_000);
    expect(mockPost).toHaveBeenCalledTimes(2);
  });

  it('announces a change the sender makes to a request you already accepted — never silently', async () => {
    await handleIncomingRequest({ sender: SENDER, body: request() }, { notify: true });
    const [row] = listRequestsByStatus(['unattended']);
    acceptRequest(row.id);
    mockPost.mockClear();
    await handleIncomingRequest({ sender: SENDER, body: request({ amountMinor: 90_000 }) }, { notify: true });
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(listRequestsByStatus(['accepted'])[0].amountMinor).toBe(90_000);
  });

  it('a withdrawal removes it and takes the notification off the shade', async () => {
    await handleIncomingRequest({ sender: SENDER, body: request() }, { notify: true });
    await handleIncomingRequest({ sender: SENDER, body: encodeWithdraw({ ref: 'ab2cd3' }) }, { notify: true });
    expect(listRequestsByStatus(['unattended'])).toEqual([]);
    expect(listRequestsByStatus(['withdrawn'])).toHaveLength(1);
    expect(mockCancel).toHaveBeenCalledTimes(1);
  });

  it('a withdrawal for something never received changes nothing', async () => {
    expect(await handleIncomingRequest({ sender: SENDER, body: encodeWithdraw({ ref: 'zz2zz3' }) }, { notify: true })).toBe(true);
    expect(listRequestsByStatus(['unattended', 'withdrawn'])).toEqual([]);
  });

  it('two senders can use the same ref independently', async () => {
    await handleIncomingRequest({ sender: SENDER, body: request() }, { notify: false });
    await handleIncomingRequest({ sender: '+919742590888', body: request() }, { notify: false });
    expect(listRequestsByStatus(['unattended'])).toHaveLength(2);
  });
});

describe('abuse limits (IMP-080)', () => {
  it('at most 5 new requests per sender per hour; the rest are dropped silently', async () => {
    const refs = ['ab2cd3', 'ab2cd4', 'ab2cd5', 'ab2cd6', 'ab2cd7', 'ab2cda', 'ab2cdb', 'ab2cdc'];
    const handled: boolean[] = [];
    for (const ref of refs) handled.push(await handleIncomingRequest({ sender: SENDER, body: request({ ref }) }, { notify: true }));
    expect(listRequestsByStatus(['unattended'])).toHaveLength(5);
    expect(mockPost).toHaveBeenCalledTimes(5);
    expect(handled.every(Boolean)).toBe(true); // a dropped request is still "handled" — never a bank suggestion
  });
});

describe('notify: false (app-open sweep — the user is already looking)', () => {
  it('still records the request but posts no notification', async () => {
    await handleIncomingRequest({ sender: SENDER, body: request() }, { notify: false });
    expect(listRequestsByStatus(['unattended'])).toHaveLength(1);
    expect(mockPost).not.toHaveBeenCalled();
  });
});

describe('privacy (IMP-088, P-9)', () => {
  it('stores only ref / amount / note / sender — the SMS body is nowhere in the row', async () => {
    const body = `${request()} SECRET-TEXT-1234`;
    await handleIncomingRequest({ sender: SENDER, body }, { notify: false });
    const stored = JSON.stringify(listRequestsByStatus(['unattended']));
    expect(stored).not.toContain('SECRET-TEXT-1234');
    expect(stored).not.toContain('CoinFlow split');
  });
});
