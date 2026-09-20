/**
 * FILE PURPOSE
 * ------------
 * Data access for `split_request_in` — split requests other people sent YOU (SPEC-implementation.md §39.4,
 * §42.2, IMP-079/080/082/088, D40/D46).
 *
 * TRUST
 * -----
 * A request is untrusted input from any phone number. `receiveRequest` therefore only *records* it as
 * `unattended`; nothing here ever accepts, pays, replies or settles by itself (D46). The raw SMS text is
 * never stored — only the sender's number, the reference, the amount and a ≤ 24-character note (P-9).
 */

import { and, asc, desc, eq, gt, inArray, lt, sql } from 'drizzle-orm';
import { randomUUID } from 'expo-crypto';

import { normalizePhone } from '@/domain/person';
import { MAX_REQUEST_MINOR, sanitizeNote } from '@/domain/split-message';

import { db } from '../client';
import { persons, splitRequestsIn, type RequestInStatus, type SplitRequestIn } from '../schema';
import { findOrCreatePerson } from './persons';
import { settledByRequest } from './settlements';

/** At most this many *new* requests from one number per hour (anti-spam). */
export const MAX_NEW_PER_SENDER_PER_HOUR = 5;
/** At most this many requests may sit unattended at once. */
export const MAX_UNATTENDED = 100;
/** Rejected / withdrawn tombstones are purged this long after their last change. */
export const TOMBSTONE_TTL_MS = 30 * 86_400_000;

export type ReceiveResult =
  | { kind: 'created' | 'updated' | 'withdrawn'; request: SplitRequestIn }
  | {
      kind: 'ignored';
      reason: 'bad_number' | 'bad_amount' | 'duplicate' | 'closed' | 'has_settlements' | 'not_found' | 'rate_limited' | 'inbox_full';
    };

/**
 * Applies one decoded request (IMP-080):
 * - unknown (sender, ref) → a new `unattended` request (subject to the rate limit and inbox cap);
 * - known and still open → its amount/note is updated (a repeat with the same amount is a no-op);
 * - amount `0` → the request is withdrawn (only while nothing has been paid against it);
 * - known but rejected / withdrawn → ignored, so a decision is never silently reopened.
 */
export function receiveRequest(
  input: { fromPhone: string; ref: string; amountMinor: number; note?: string | null },
  now: number = Date.now(),
): ReceiveResult {
  const phone = normalizePhone(input.fromPhone);
  if (!phone) return { kind: 'ignored', reason: 'bad_number' };
  if (!Number.isInteger(input.amountMinor) || input.amountMinor < 0 || input.amountMinor > MAX_REQUEST_MINOR) {
    return { kind: 'ignored', reason: 'bad_amount' };
  }
  const note = sanitizeNote(input.note) || null;

  const existing = db
    .select()
    .from(splitRequestsIn)
    .where(and(eq(splitRequestsIn.fromPhoneKey, phone.phoneKey), eq(splitRequestsIn.remoteRef, input.ref)))
    .get();

  if (existing) {
    if (existing.status === 'rejected' || existing.status === 'withdrawn') return { kind: 'ignored', reason: 'closed' };
    const settled = settledByRequest([existing.id]).get(existing.id) ?? 0;
    if (input.amountMinor === 0) {
      if (settled > 0) return { kind: 'ignored', reason: 'has_settlements' };
      db.update(splitRequestsIn).set({ status: 'withdrawn', updatedAt: now }).where(eq(splitRequestsIn.id, existing.id)).run();
      return { kind: 'withdrawn', request: { ...existing, status: 'withdrawn', updatedAt: now } };
    }
    if (settled > 0) return { kind: 'ignored', reason: 'has_settlements' };
    if (existing.amountMinor === input.amountMinor && (existing.forNote ?? null) === note) {
      return { kind: 'ignored', reason: 'duplicate' };
    }
    const patch = { amountMinor: input.amountMinor, forNote: note, updatedAt: now };
    db.update(splitRequestsIn).set(patch).where(eq(splitRequestsIn.id, existing.id)).run();
    return { kind: 'updated', request: { ...existing, ...patch } };
  }

  if (input.amountMinor === 0) return { kind: 'ignored', reason: 'not_found' }; // withdrawing something we never saw

  const recent = Number(
    db
      .select({ n: sql<number>`count(*)` })
      .from(splitRequestsIn)
      .where(and(eq(splitRequestsIn.fromPhoneKey, phone.phoneKey), gt(splitRequestsIn.receivedAt, now - 3_600_000)))
      .get()?.n ?? 0,
  );
  if (recent >= MAX_NEW_PER_SENDER_PER_HOUR) return { kind: 'ignored', reason: 'rate_limited' };
  const unattended = Number(
    db.select({ n: sql<number>`count(*)` }).from(splitRequestsIn).where(eq(splitRequestsIn.status, 'unattended')).get()?.n ?? 0,
  );
  if (unattended >= MAX_UNATTENDED) return { kind: 'ignored', reason: 'inbox_full' };

  const person = findOrCreatePerson({ phone: input.fromPhone, source: 'sms' }, now);
  const row: SplitRequestIn = {
    id: randomUUID(),
    fromPhoneKey: phone.phoneKey,
    fromPersonId: person.id,
    fromLabel: person.displayName,
    remoteRef: input.ref,
    amountMinor: input.amountMinor,
    forNote: note,
    receivedAt: now,
    status: 'unattended',
    updatedAt: now,
  };
  db.insert(splitRequestsIn).values(row).run();
  return { kind: 'created', request: row };
}

export function getRequest(id: string): SplitRequestIn | undefined {
  return db.select().from(splitRequestsIn).where(eq(splitRequestsIn.id, id)).get() ?? undefined;
}

function setStatus(id: string, from: RequestInStatus[], to: RequestInStatus, now: number): boolean {
  const res = db
    .update(splitRequestsIn)
    .set({ status: to, updatedAt: now })
    .where(and(eq(splitRequestsIn.id, id), inArray(splitRequestsIn.status, from)))
    .run();
  return res.changes > 0;
}

/** Unattended → accepted (it now counts as something you owe). */
export function acceptRequest(id: string, now: number = Date.now()): boolean {
  return setStatus(id, ['unattended'], 'accepted', now);
}

/** Unattended → rejected: discarded silently — the sender is never told — but kept as a hidden tombstone. */
export function rejectRequest(id: string, now: number = Date.now()): boolean {
  return setStatus(id, ['unattended'], 'rejected', now);
}

/** Undo for Accept / Reject: back to unattended. Refused once anything has been paid against it. */
export function undoDecision(id: string, now: number = Date.now()): boolean {
  if ((settledByRequest([id]).get(id) ?? 0) > 0) return false;
  return setStatus(id, ['accepted', 'rejected'], 'unattended', now);
}

export type RequestView = SplitRequestIn & {
  settledMinor: number;
  remainingMinor: number;
  /** `false` when the sender is only a number we met through this SMS ("not in your people", §6.21). */
  knownPerson: boolean;
};

function withSettled(rows: SplitRequestIn[]): RequestView[] {
  const settled = settledByRequest(rows.map((r) => r.id));
  const personIds = [...new Set(rows.map((r) => r.fromPersonId).filter((id): id is string => !!id))];
  const smsOnly = new Set(
    personIds.length === 0
      ? []
      : db
          .select({ id: persons.id, source: persons.source })
          .from(persons)
          .where(inArray(persons.id, personIds))
          .all()
          .filter((p) => p.source === 'sms')
          .map((p) => p.id),
  );
  return rows.map((r) => {
    const settledMinor = settled.get(r.id) ?? 0;
    return {
      ...r,
      settledMinor,
      remainingMinor: Math.max(0, r.amountMinor - settledMinor),
      knownPerson: !!r.fromPersonId && !smsOnly.has(r.fromPersonId),
    };
  });
}

/** Requests in the given statuses, newest first (Splits › Requests). Tombstones are only returned if asked for. */
export function listRequestsByStatus(statuses: readonly RequestInStatus[]): RequestView[] {
  if (statuses.length === 0) return [];
  return withSettled(
    db
      .select()
      .from(splitRequestsIn)
      .where(inArray(splitRequestsIn.status, [...statuses]))
      .orderBy(desc(splitRequestsIn.receivedAt))
      .all(),
  );
}

/** Accepted requests with something still owed — the "You owe" list and the Merge candidates for a debit. */
export function listOpenRequests(): RequestView[] {
  return withSettled(
    db
      .select()
      .from(splitRequestsIn)
      .where(eq(splitRequestsIn.status, 'accepted'))
      .orderBy(asc(splitRequestsIn.receivedAt))
      .all(),
  ).filter((r) => r.remainingMinor > 0);
}

/** Accepted requests you have paid in full (Splits › You owe › Show settled), newest first. */
export function listSettledRequests(): RequestView[] {
  return withSettled(
    db
      .select()
      .from(splitRequestsIn)
      .where(eq(splitRequestsIn.status, 'accepted'))
      .orderBy(desc(splitRequestsIn.receivedAt))
      .all(),
  ).filter((r) => r.remainingMinor === 0);
}

/** Total you still owe across accepted requests. */
export function youOweMinor(): number {
  return listOpenRequests().reduce((a, r) => a + r.remainingMinor, 0);
}

/** Deletes rejected / withdrawn tombstones untouched for 30 days; returns how many. */
export function purgeRequestTombstones(now: number = Date.now()): number {
  const res = db
    .delete(splitRequestsIn)
    .where(and(inArray(splitRequestsIn.status, ['rejected', 'withdrawn']), lt(splitRequestsIn.updatedAt, now - TOMBSTONE_TTL_MS)))
    .run();
  return res.changes;
}
