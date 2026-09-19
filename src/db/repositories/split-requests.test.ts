import { eq } from 'drizzle-orm';

import { persons, splitRequestsIn } from '../schema';
import { insertTransaction } from '../test-support/fixtures';
import { createMemoryDb } from '../test-support/memory-db';
import { deletePersonIfUnused } from './persons';
import { settle } from './settlements';
import {
  MAX_NEW_PER_SENDER_PER_HOUR,
  MAX_UNATTENDED,
  TOMBSTONE_TTL_MS,
  acceptRequest,
  getRequest,
  listOpenRequests,
  listRequestsByStatus,
  purgeRequestTombstones,
  receiveRequest,
  rejectRequest,
  undoDecision,
  youOweMinor,
} from './split-requests';

let mockMem: ReturnType<typeof createMemoryDb>;
let mockCounter = 0;
jest.mock('../client', () => ({
  get db() {
    return mockMem.db;
  },
}));
jest.mock('expo-crypto', () => ({
  randomUUID: () => `id-${++mockCounter}`,
  getRandomBytes: (n: number) => Uint8Array.from({ length: n }, (_v, i) => (mockCounter * 43 + i * 19) % 256),
}));

const db = () => mockMem.db;
const HOUR = 3_600_000;
const FROM = '+919742590888';

function receive(over: Partial<Parameters<typeof receiveRequest>[0]> = {}, now = 1_000_000) {
  return receiveRequest({ fromPhone: FROM, ref: 'ab2cd3', amountMinor: 45_000, note: 'Momos', ...over }, now);
}
function created(over: Partial<Parameters<typeof receiveRequest>[0]> = {}, now = 1_000_000) {
  const r = receive(over, now);
  if (r.kind !== 'created') throw new Error(`expected created, got ${JSON.stringify(r)}`);
  return r.request;
}

beforeEach(() => {
  mockMem?.close();
  mockMem = createMemoryDb();
  mockCounter = 0;
});

describe('receiveRequest — new requests (IMP-080, IMP-082)', () => {
  it('records an unattended request and remembers the sender as an SMS person', () => {
    const r = receive();
    expect(r.kind).toBe('created');
    const req = (r as { request: { id: string } }).request;
    expect(getRequest(req.id)).toMatchObject({
      fromPhoneKey: '9742590888',
      remoteRef: 'ab2cd3',
      amountMinor: 45_000,
      forNote: 'Momos',
      status: 'unattended',
      fromLabel: '+919742590888',
      receivedAt: 1_000_000,
    });
    expect(db().select().from(persons).all()).toEqual([expect.objectContaining({ phoneKey: '9742590888', source: 'sms' })]);
  });

  it('links to an already-saved person and shows their name', () => {
    db().insert(persons).values({ id: 'p1', displayName: 'Neha', phoneKey: '9742590888', phoneDisplay: FROM, source: 'contact', createdAt: 1, updatedAt: 1 }).run();
    const req = created();
    expect(req.fromPersonId).toBe('p1');
    expect(req.fromLabel).toBe('Neha');
  });

  it('accepts different spellings of the sender number as the same sender', () => {
    created({ fromPhone: '9742590888' });
    expect(receive({ fromPhone: '+91 97425 90888' }).kind).toBe('ignored'); // same (sender, ref) → duplicate
  });

  it('never stores anything but ref / amount / note / number — there is no body column (IMP-088, P-9)', () => {
    const cols = (mockMem.raw.prepare('pragma table_info(split_request_in)').all() as { name: string }[]).map((c) => c.name);
    expect(cols.sort()).toEqual(
      ['amountMinor', 'forNote', 'fromLabel', 'fromPersonId', 'fromPhoneKey', 'id', 'receivedAt', 'remoteRef', 'status', 'updatedAt'].sort(),
    );
  });

  it('sanitises the note and treats an empty note as null', () => {
    expect(created({ note: 'Momos | {big}' }).forNote).toBe('Momos big');
    expect(created({ ref: 'zz2zz3', note: '   ' }).forNote).toBeNull();
    expect(created({ ref: 'zz2zz4', note: undefined }).forNote).toBeNull();
  });
});

describe('receiveRequest — rejected input is ignored', () => {
  it('ignores a sender that is not an Indian mobile number', () => {
    expect(receive({ fromPhone: 'VA-SBICRD-P' })).toEqual({ kind: 'ignored', reason: 'bad_number' });
    expect(receive({ fromPhone: '+14155552671' })).toEqual({ kind: 'ignored', reason: 'bad_number' });
  });

  it('ignores an out-of-range or fractional amount', () => {
    expect(receive({ amountMinor: -1 })).toEqual({ kind: 'ignored', reason: 'bad_amount' });
    expect(receive({ amountMinor: 100_000_001 })).toEqual({ kind: 'ignored', reason: 'bad_amount' });
    expect(receive({ amountMinor: 10.5 })).toEqual({ kind: 'ignored', reason: 'bad_amount' });
    expect(db().select().from(splitRequestsIn).all()).toEqual([]);
  });

  it('ignores a withdrawal for a request it never saw', () => {
    expect(receive({ amountMinor: 0 })).toEqual({ kind: 'ignored', reason: 'not_found' });
    expect(db().select().from(splitRequestsIn).all()).toEqual([]);
  });
});

describe('receiveRequest — repeats, updates, withdrawals (IMP-080)', () => {
  it('an identical repeat is a no-op (the ingest guard makes re-reads idempotent)', () => {
    created();
    expect(receive({}, 2_000_000)).toEqual({ kind: 'ignored', reason: 'duplicate' });
    expect(db().select().from(splitRequestsIn).all()).toHaveLength(1);
  });

  it('the same ref with a new amount updates an open request', () => {
    const req = created();
    const r = receive({ amountMinor: 50_000, note: 'Momos + chai' }, 2_000_000);
    expect(r.kind).toBe('updated');
    expect(getRequest(req.id)).toMatchObject({ amountMinor: 50_000, forNote: 'Momos + chai', updatedAt: 2_000_000, status: 'unattended' });
  });

  it('an update also applies to an accepted request', () => {
    const req = created();
    acceptRequest(req.id);
    expect(receive({ amountMinor: 46_000 }, 2_000_000).kind).toBe('updated');
    expect(getRequest(req.id)!.status).toBe('accepted');
  });

  it('amount 0 withdraws an open request', () => {
    const req = created();
    const r = receive({ amountMinor: 0 }, 2_000_000);
    expect(r.kind).toBe('withdrawn');
    expect(getRequest(req.id)!.status).toBe('withdrawn');
    expect(listRequestsByStatus(['unattended', 'accepted'])).toEqual([]);
  });

  it('does not change or withdraw a request you have already paid against', () => {
    const req = created();
    acceptRequest(req.id);
    const d = insertTransaction(db(), { direction: 'debit', type: 'expense', amountMinor: 10_000 });
    settle({ transactionId: d.id, picks: [{ requestId: req.id }] });
    expect(receive({ amountMinor: 99_000 })).toEqual({ kind: 'ignored', reason: 'has_settlements' });
    expect(receive({ amountMinor: 0 })).toEqual({ kind: 'ignored', reason: 'has_settlements' });
    expect(getRequest(req.id)).toMatchObject({ status: 'accepted', amountMinor: 45_000 });
  });

  it('never silently reopens a rejected or withdrawn request', () => {
    const a = created();
    rejectRequest(a.id);
    expect(receive({ amountMinor: 99_000 })).toEqual({ kind: 'ignored', reason: 'closed' });
    expect(getRequest(a.id)!.status).toBe('rejected');
    const b = created({ ref: 'zz2zz3' });
    receive({ ref: 'zz2zz3', amountMinor: 0 });
    expect(receive({ ref: 'zz2zz3', amountMinor: 100 })).toEqual({ kind: 'ignored', reason: 'closed' });
    expect(getRequest(b.id)!.status).toBe('withdrawn');
  });
});

describe('receiveRequest — abuse limits (IMP-080)', () => {
  it(`stops after ${MAX_NEW_PER_SENDER_PER_HOUR} new requests per sender per hour, then allows again`, () => {
    const t = 10 * HOUR;
    for (let i = 0; i < MAX_NEW_PER_SENDER_PER_HOUR; i++) {
      expect(receive({ ref: `aaaaa${'abcdefg'[i]}` }, t + i).kind).toBe('created');
    }
    expect(receive({ ref: 'aaaaah' }, t + 100)).toEqual({ kind: 'ignored', reason: 'rate_limited' });
    expect(receive({ ref: 'aaaaah' }, t + HOUR + 1_000).kind).toBe('created');
  });

  it('counts rejected tombstones toward the limit, and other senders are independent', () => {
    const t = 10 * HOUR;
    for (let i = 0; i < MAX_NEW_PER_SENDER_PER_HOUR; i++) {
      const r = created({ ref: `bbbbb${'abcdefg'[i]}` }, t + i);
      rejectRequest(r.id, t + i);
    }
    expect(receive({ ref: 'bbbbbh' }, t + 50)).toEqual({ kind: 'ignored', reason: 'rate_limited' });
    expect(receive({ fromPhone: '9845897555', ref: 'bbbbbh' }, t + 50).kind).toBe('created');
  });

  it(`caps the unattended inbox at ${MAX_UNATTENDED}`, () => {
    // insert directly (many different senders) to reach the cap quickly
    for (let i = 0; i < MAX_UNATTENDED; i++) {
      db().insert(splitRequestsIn).values({
        id: `u${i}`, fromPhoneKey: `90000${String(i).padStart(5, '0')}`, fromLabel: 'x', remoteRef: 'aaaaaa', amountMinor: 1,
        receivedAt: 5, status: 'unattended', updatedAt: 5,
      }).run();
    }
    expect(receive({}, 50 * HOUR)).toEqual({ kind: 'ignored', reason: 'inbox_full' });
  });
});

describe('accept / reject / undo (IMP-082)', () => {
  it('accept moves an unattended request to accepted, and only from unattended', () => {
    const req = created();
    expect(acceptRequest(req.id, 2000)).toBe(true);
    expect(getRequest(req.id)).toMatchObject({ status: 'accepted', updatedAt: 2000 });
    expect(acceptRequest(req.id)).toBe(false);
    expect(rejectRequest(req.id)).toBe(false); // already decided
    expect(acceptRequest('missing')).toBe(false);
  });

  it('reject keeps a hidden tombstone (so a repeat does not re-notify) and never appears in the visible lists', () => {
    const req = created();
    expect(rejectRequest(req.id)).toBe(true);
    expect(getRequest(req.id)!.status).toBe('rejected');
    expect(listRequestsByStatus(['unattended', 'accepted'])).toEqual([]);
    expect(listRequestsByStatus(['rejected'])).toHaveLength(1);
  });

  it('undo returns an accepted or rejected request to unattended — unless something was paid against it', () => {
    const a = created();
    acceptRequest(a.id);
    expect(undoDecision(a.id)).toBe(true);
    expect(getRequest(a.id)!.status).toBe('unattended');
    rejectRequest(a.id);
    expect(undoDecision(a.id)).toBe(true);

    const b = created({ ref: 'zz2zz3' });
    acceptRequest(b.id);
    const d = insertTransaction(db(), { direction: 'debit', type: 'expense', amountMinor: 5_000 });
    settle({ transactionId: d.id, picks: [{ requestId: b.id }] });
    expect(undoDecision(b.id)).toBe(false);
    expect(getRequest(b.id)!.status).toBe('accepted');
  });
});

describe('open requests and what you owe', () => {
  it('lists accepted requests with what is still owed, and totals them', () => {
    const a = created({ ref: 'aaaaa2', amountMinor: 45_000 });
    const b = created({ ref: 'aaaaa3', amountMinor: 20_000 }, 1_000_100);
    created({ ref: 'aaaaa4', amountMinor: 99_000 }, 1_000_200); // stays unattended → not owed
    acceptRequest(a.id);
    acceptRequest(b.id);
    expect(listOpenRequests().map((r) => [r.remoteRef, r.remainingMinor])).toEqual([['aaaaa2', 45_000], ['aaaaa3', 20_000]]);
    expect(youOweMinor()).toBe(65_000);

    const d = insertTransaction(db(), { direction: 'debit', type: 'expense', amountMinor: 45_000 });
    settle({ transactionId: d.id, picks: [{ requestId: a.id }] });
    expect(listOpenRequests().map((r) => r.remoteRef)).toEqual(['aaaaa3']);
    expect(youOweMinor()).toBe(20_000);
    expect(listRequestsByStatus(['accepted']).find((r) => r.id === a.id)).toMatchObject({ settledMinor: 45_000, remainingMinor: 0 });
  });

  it('lists requests newest first', () => {
    created({ ref: 'aaaaa2' }, 1000);
    created({ ref: 'aaaaa3' }, 3000);
    created({ ref: 'aaaaa4' }, 2000);
    expect(listRequestsByStatus(['unattended']).map((r) => r.remoteRef)).toEqual(['aaaaa3', 'aaaaa4', 'aaaaa2']);
    expect(listRequestsByStatus([])).toEqual([]);
  });

  it('a person with only a rejected (tombstone) request can be deleted; the request keeps its row', () => {
    const req = created();
    rejectRequest(req.id);
    expect(deletePersonIfUnused(req.fromPersonId as string)).toBe(true);
    expect(getRequest(req.id)!.fromPersonId).toBeNull(); // ON DELETE SET NULL
  });
});

describe('purgeRequestTombstones (§20.6)', () => {
  it('deletes rejected / withdrawn rows untouched for 30 days, and nothing else', () => {
    const old = created({ ref: 'aaaaa2' }, 1000);
    rejectRequest(old.id, 1000);
    const wd = created({ ref: 'aaaaa3' }, 1000);
    receive({ ref: 'aaaaa3', amountMinor: 0 }, 1000);
    const fresh = created({ ref: 'aaaaa4' }, 2 * TOMBSTONE_TTL_MS);
    rejectRequest(fresh.id, 2 * TOMBSTONE_TTL_MS);
    const open = created({ ref: 'aaaaa5' }, 1000); // unattended and old: never purged
    const n = purgeRequestTombstones(1000 + TOMBSTONE_TTL_MS + 1);
    expect(n).toBe(2);
    expect(getRequest(old.id)).toBeUndefined();
    expect(getRequest(wd.id)).toBeUndefined();
    expect(getRequest(fresh.id)).toBeDefined();
    expect(getRequest(open.id)).toBeDefined();
    expect(db().select().from(splitRequestsIn).where(eq(splitRequestsIn.id, open.id)).get()).toBeDefined();
  });
});
