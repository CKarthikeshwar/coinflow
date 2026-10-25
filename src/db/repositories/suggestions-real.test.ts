/**
 * CR-30 — `dismissSuggestion` / `dismissAllPending` against real in-memory SQLite. The whole point of this fix:
 * dismissing a suggestion must permanently stop the exact SMS that produced it from ever being turned back into a
 * pending suggestion, even though the SMS itself stays in the phone's inbox and `SmsReconciler` re-reads the last
 * 48h of it on every app open (`services/tasks/sms-reconcile.ts`). Before CR-30, dismiss was a hard DELETE, which
 * freed the suggestion's `dedupeKey` and let exactly that happen — this is the regression this file guards.
 */

import { eq } from 'drizzle-orm';

import { purge } from '../maintenance';
import {
  countPending,
  dismissAllPending,
  dismissSuggestion,
  getSuggestion,
  insertIfNew,
  listPending,
} from './suggestions';
import { hasDedupeKey } from './transactions';
import { suggestions } from '../schema';
import { createMemoryDb } from '../test-support/memory-db';

let mockMem: ReturnType<typeof createMemoryDb>;
let mockCounter = 0;
jest.mock('../client', () => ({
  get db() {
    return mockMem.db;
  },
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => `sugg-${++mockCounter}` }));

beforeEach(() => {
  mockMem = createMemoryDb();
  mockCounter = 0;
});

const suggestionInput = (overrides: Partial<Parameters<typeof insertIfNew>[0]> = {}) => ({
  amountMinor: 14000,
  direction: 'debit' as const,
  occurredAt: 1_790_000_000_000,
  account: 'Akarsh Naidu',
  normalizedKey: 'akarsh naidu',
  paymentMethod: 'upi' as const,
  smsSender: 'AD-CANBNK-S',
  smsReceivedAt: 1_790_000_000_000,
  dedupeKey: 'dedupe-fixed-key',
  ...overrides,
});

describe('the resurrection bug (CR-30)', () => {
  it('a re-ingest of the SAME SMS after dismiss does NOT create a new pending suggestion', () => {
    // Step 1: the original SMS arrives (sms-ingest.ts step 5).
    const first = insertIfNew(suggestionInput());
    expect(first.created).toBe(true);
    expect(countPending()).toBe(1);

    // Step 2: the user dismisses it (notification Discard, or Review Queue).
    dismissSuggestion(first.id);
    expect(countPending()).toBe(0);
    expect(listPending()).toEqual([]);

    // Step 3: SmsReconciler's foreground sweep re-reads the phone's SMS inbox and re-parses the SAME
    // message — sms-ingest.ts step 4's guard, which this reproduces directly.
    expect(hasDedupeKey(suggestionInput().dedupeKey)).toBe(true); // blocks the sweep before it ever calls insertIfNew

    // Even if something did call insertIfNew again (belt-and-braces — the real dedupeKey uniqueness):
    const second = insertIfNew(suggestionInput());
    expect(second.created).toBe(false);
    expect(second.id).toBe(first.id); // resolves to the SAME (still-dismissed) row, not a fresh pending one
    expect(countPending()).toBe(0);
    expect(getSuggestion(first.id)?.status).toBe('dismissed');
  });

  it('dismissSuggestion keeps the row (tombstone), not a DELETE — dismissedAt is stamped', () => {
    const { id } = insertIfNew(suggestionInput());
    const before = Date.now();
    dismissSuggestion(id);
    const row = getSuggestion(id);
    expect(row).not.toBeNull();
    expect(row?.status).toBe('dismissed');
    expect(row?.dismissedAt).toBeGreaterThanOrEqual(before);
  });

  it('dismissAllPending tombstones every pending row, in one write, and reports the count', () => {
    const a = insertIfNew(suggestionInput({ dedupeKey: 'k1' }));
    const b = insertIfNew(suggestionInput({ dedupeKey: 'k2' }));
    expect(countPending()).toBe(2);

    const changed = dismissAllPending();

    expect(changed).toBe(2);
    expect(countPending()).toBe(0);
    expect(getSuggestion(a.id)?.status).toBe('dismissed');
    expect(getSuggestion(b.id)?.status).toBe('dismissed');
    // neither SMS can resurrect afterwards
    expect(hasDedupeKey('k1')).toBe(true);
    expect(hasDedupeKey('k2')).toBe(true);
  });

  it('dismissAllPending never touches an already-confirmed suggestion', () => {
    const { id } = insertIfNew(suggestionInput());
    mockMem.db.update(suggestions).set({ status: 'confirmed' }).where(eq(suggestions.id, id)).run();
    dismissAllPending();
    expect(getSuggestion(id)?.status).toBe('confirmed');
  });
});

describe('purge() and the dismissed tombstone TTL (CR-30)', () => {
  it('keeps a recently-dismissed tombstone — the sweep can still reach that SMS', () => {
    const { id } = insertIfNew(suggestionInput());
    dismissSuggestion(id);
    purge(Date.now() + 60_000); // well under the 4-day TTL
    expect(getSuggestion(id)).not.toBeNull();
    expect(hasDedupeKey(suggestionInput().dedupeKey)).toBe(true);
  });

  it('purges a tombstone once the sweep can no longer reach the original SMS (past its 48h lookback + margin)', () => {
    const { id } = insertIfNew(suggestionInput());
    dismissSuggestion(id);
    purge(Date.now() + 5 * 24 * 60 * 60 * 1000); // past DISMISSED_SUGGESTION_TTL_MS (4 days)
    expect(getSuggestion(id)).toBeNull();
  });

  it('purge never touches a pending or confirmed suggestion, only stale dismissed/confirmed ones by their own rules', () => {
    const pending = insertIfNew(suggestionInput({ dedupeKey: 'still-pending' }));
    purge(Date.now() + 30 * 24 * 60 * 60 * 1000);
    expect(getSuggestion(pending.id)?.status).toBe('pending');
  });
});
