/**
 * §46.7 balanceRepo against real in-memory SQLite: idempotent snapshots, retention, "It's fine", and the derived
 * per-account view (current balance, staleness, Needs a look — pending suggestions count as recorded).
 */

import { accountBalances, suggestions } from '../schema';
import { insertTransaction } from '../test-support/fixtures';
import { createMemoryDb } from '../test-support/memory-db';
import { createAccount, mergeAccounts } from './accounts';
import {
  acknowledgeDiscrepancy,
  listAccountViews,
  listSnapshots,
  purgeOldSnapshots,
  recordSnapshot,
  SNAPSHOT_KEEP_COUNT,
  SNAPSHOT_KEEP_MS,
} from './balances';

let mockMem: ReturnType<typeof createMemoryDb>;
let mockCounter = 0;
jest.mock('../client', () => ({
  get db() {
    return mockMem.db;
  },
}));
jest.mock('@/hooks/use-live-query', () => ({ useLiveQuery: jest.fn() }));
jest.mock('expo-crypto', () => ({ randomUUID: () => `id-${++mockCounter}` }));

const db = () => mockMem.db;
const DAY = 86_400_000;
const NOW = 100 * DAY;
let hdfc: string;

const view = () => listAccountViews({ now: NOW }).find((v) => v.account.id === hdfc)!;

beforeEach(() => {
  mockMem?.close();
  mockMem = createMemoryDb();
  mockCounter = 0;
  hdfc = createAccount({ kind: 'bank', nickname: 'HDFC', bankName: 'HDFC', last4: '672' }).id;
});

describe('recordSnapshot', () => {
  it('the same SMS read twice adds one snapshot', () => {
    expect(recordSnapshot({ accountId: hdfc, balanceMinor: 500, asOf: 10, source: 'sms' })).toEqual({ created: true });
    expect(recordSnapshot({ accountId: hdfc, balanceMinor: 500, asOf: 10, source: 'sms' })).toEqual({ created: false });
    expect(listSnapshots(hdfc)).toHaveLength(1);
  });
});

describe('the account view', () => {
  it('no snapshot ⇒ no balance', () => {
    insertTransaction(db(), { accountId: hdfc, amountMinor: 100, occurredAt: NOW - 5 });
    expect(view().balance).toBeNull();
  });

  it('newest snapshot + saved rows and pending suggestions after it; other accounts and deleted rows ignored', () => {
    recordSnapshot({ accountId: hdfc, balanceMinor: 10_000, asOf: NOW - 2 * DAY, source: 'sms' });
    insertTransaction(db(), { accountId: hdfc, direction: 'debit', amountMinor: 1_000, occurredAt: NOW - DAY });
    insertTransaction(db(), { accountId: hdfc, direction: 'debit', amountMinor: 9_999, occurredAt: NOW - DAY, deletedAt: 1 });
    insertTransaction(db(), { accountId: null, direction: 'debit', amountMinor: 7, occurredAt: NOW - DAY });
    db().insert(suggestions).values({
      id: 's1', amountMinor: 500, direction: 'credit', occurredAt: NOW - DAY / 2, smsSender: 'X', smsReceivedAt: 1,
      dedupeKey: 'k1', createdAt: 1, accountId: hdfc, status: 'pending',
    }).run();
    db().insert(suggestions).values({
      id: 's2', amountMinor: 800, direction: 'debit', occurredAt: NOW - DAY / 2, smsSender: 'X', smsReceivedAt: 1,
      dedupeKey: 'k2', createdAt: 1, accountId: hdfc, status: 'dismissed',
    }).run();
    expect(view().balance).toEqual({ balanceMinor: 9_500, asOf: NOW - 2 * DAY });
  });

  it('stale after three days', () => {
    recordSnapshot({ accountId: hdfc, balanceMinor: 1, asOf: NOW - 4 * DAY, source: 'sms' });
    expect(view().stale).toBe(true);
  });

  it('a manual figure becomes the anchor', () => {
    recordSnapshot({ accountId: hdfc, balanceMinor: 10_000, asOf: NOW - 2 * DAY, source: 'sms' });
    recordSnapshot({ accountId: hdfc, balanceMinor: 42_00, asOf: NOW - 1, source: 'manual' });
    expect(view().balance?.balanceMinor).toBe(42_00);
  });
});

describe('Needs a look (UI-107)', () => {
  beforeEach(() => {
    recordSnapshot({ accountId: hdfc, balanceMinor: 10_000_00, asOf: NOW - 2 * DAY, source: 'sms' });
    recordSnapshot({ accountId: hdfc, balanceMinor: 7_000_00, asOf: NOW - DAY, source: 'sms' });
  });

  it('₹3,000 left with ₹1,800 recorded ⇒ ₹1,200 unexplained', () => {
    insertTransaction(db(), { accountId: hdfc, direction: 'debit', amountMinor: 1_800_00, occurredAt: NOW - 1.5 * DAY });
    expect(view().discrepancies).toEqual([expect.objectContaining({ diffMinor: -1_200_00 })]);
  });

  it('a pending suggestion in the window counts as recorded', () => {
    db().insert(suggestions).values({
      id: 's1', amountMinor: 3_000_00, direction: 'debit', occurredAt: NOW - DAY, smsSender: 'X', smsReceivedAt: 1,
      dedupeKey: 'k1', createdAt: 1, accountId: hdfc, status: 'pending',
    }).run();
    expect(view().discrepancies).toEqual([]);
  });

  it('"It\'s fine" hides it; the balance is unchanged', () => {
    const [d] = view().discrepancies;
    acknowledgeDiscrepancy(d.snapshotId);
    expect(view().discrepancies).toEqual([]);
    expect(view().balance?.balanceMinor).toBe(7_000_00);
  });

  it('adding the late transaction clears it by itself', () => {
    expect(view().discrepancies).toHaveLength(1);
    insertTransaction(db(), { accountId: hdfc, direction: 'debit', amountMinor: 3_000_00, occurredAt: NOW - 1.2 * DAY });
    expect(view().discrepancies).toEqual([]);
  });
});

describe('retention (§46.2)', () => {
  it('keeps the newest 200 per account and nothing older than 90 days except the newest', () => {
    for (let i = 0; i < SNAPSHOT_KEEP_COUNT + 5; i++) {
      recordSnapshot({ accountId: hdfc, balanceMinor: i, asOf: NOW - i * 60_000, source: 'sms' });
    }
    const other = createAccount({ kind: 'bank', nickname: 'Old', bankName: 'SBI', last4: '1' }).id;
    recordSnapshot({ accountId: other, balanceMinor: 1, asOf: NOW - SNAPSHOT_KEEP_MS - 2 * DAY, source: 'sms' });
    recordSnapshot({ accountId: other, balanceMinor: 2, asOf: NOW - SNAPSHOT_KEEP_MS - DAY, source: 'sms' });

    purgeOldSnapshots(NOW);

    expect(listSnapshots(hdfc)).toHaveLength(SNAPSHOT_KEEP_COUNT);
    expect(listSnapshots(hdfc).at(-1)?.balanceMinor).toBe(0); // the newest survived
    expect(listSnapshots(other).map((s) => s.balanceMinor)).toEqual([2]); // only the newest old one
  });
});

describe('merge moves balances', () => {
  it('snapshots follow the merged account', () => {
    const dup = createAccount({ kind: 'bank', nickname: 'Dup', bankName: 'HDFC', last4: '9672' }).id;
    recordSnapshot({ accountId: dup, balanceMinor: 5, asOf: NOW - 1, source: 'sms' });
    mergeAccounts(dup, hdfc);
    expect(db().select().from(accountBalances).all().map((s) => s.accountId)).toEqual([hdfc]);
    expect(view().balance?.balanceMinor).toBe(5);
  });
});
