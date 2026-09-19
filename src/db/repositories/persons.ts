/**
 * FILE PURPOSE
 * ------------
 * Data access for `person` — the people you split with (SPEC-implementation.md §39.1 / §43.1, IMP-077).
 *
 * A person is identified by their normalised 10-digit mobile number (`phoneKey`); the same number typed
 * three different ways is one person. Contacts access is optional — a person can always be added by
 * typing a number. Deleting a person is only allowed while nothing refers to them.
 */

import { and, desc, eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'expo-crypto';

import { normalizePhone } from '@/domain/person';

import { db } from '../client';
import { persons, splitRequestsIn, splitShares, type Person } from '../schema';

export type PersonInput = {
  /** Shown in lists; falls back to the phone number when empty. */
  displayName?: string | null;
  /** Any spelling of an Indian mobile number; required unless you only have a name. */
  phone?: string | null;
  /** Opaque device-contact id, when picked from contacts. */
  contactRef?: string | null;
  source: Person['source'];
};

export function getPerson(id: string): Person | undefined {
  return db.select().from(persons).where(eq(persons.id, id)).get() ?? undefined;
}

export function findPersonByPhone(phone: string): Person | undefined {
  const normalized = normalizePhone(phone);
  if (!normalized) return undefined;
  return db.select().from(persons).where(eq(persons.phoneKey, normalized.phoneKey)).get() ?? undefined;
}

/**
 * Returns the existing person with this number, or creates one. When the number is already known:
 * a person first seen only as an SMS sender (`source = 'sms'`, named after their number) is upgraded to the
 * real name/source the moment the user picks or types them; otherwise the stored name is kept.
 * Throws `RangeError` if `phone` is given but is not a valid Indian mobile number.
 */
export function findOrCreatePerson(input: PersonInput, now: number = Date.now()): Person {
  const trimmedName = input.displayName?.trim() ?? '';
  const hasPhone = input.phone != null && input.phone.trim() !== '';
  const normalized = hasPhone ? normalizePhone(input.phone) : null;
  if (hasPhone && !normalized) throw new RangeError('not a valid mobile number');
  if (!normalized && !trimmedName) throw new RangeError('a name or a number is required');

  if (normalized) {
    const existing = db.select().from(persons).where(eq(persons.phoneKey, normalized.phoneKey)).get();
    if (existing) {
      const patch: Partial<Person> = { updatedAt: now };
      if (existing.source === 'sms' && input.source !== 'sms') {
        if (trimmedName) patch.displayName = trimmedName;
        patch.source = input.source;
      }
      if (input.contactRef && !existing.contactRef) patch.contactRef = input.contactRef;
      db.update(persons).set(patch).where(eq(persons.id, existing.id)).run();
      return { ...existing, ...patch } as Person;
    }
  }

  const row = {
    id: randomUUID(),
    displayName: trimmedName || normalized?.phoneDisplay || '',
    phoneKey: normalized?.phoneKey ?? null,
    phoneDisplay: normalized?.phoneDisplay ?? null,
    contactRef: input.contactRef ?? null,
    source: input.source,
    createdAt: now,
    updatedAt: now,
  } satisfies Person;
  db.insert(persons).values(row).run();
  return row;
}

/** People, most recently used first (the "Saved people" list). */
export function listPersons(): Person[] {
  return db.select().from(persons).orderBy(desc(persons.updatedAt)).all();
}

export function renamePerson(id: string, displayName: string, now: number = Date.now()): void {
  const name = displayName.trim();
  if (!name) throw new RangeError('name must not be empty');
  db.update(persons).set({ displayName: name, updatedAt: now }).where(eq(persons.id, id)).run();
}

/** Marks people as just used, so they float to the top of "Saved people". */
export function touchPersons(ids: readonly string[], now: number = Date.now()): void {
  if (ids.length === 0) return;
  db.update(persons).set({ updatedAt: now }).where(inArray(persons.id, [...ids])).run();
}

/**
 * True while anything still refers to this person: any share, or a request from them that is waiting on
 * you (unattended / accepted). Rejected / withdrawn requests are hidden tombstones and do not count.
 */
export function isPersonInUse(id: string): boolean {
  const share = db.select({ id: splitShares.id }).from(splitShares).where(eq(splitShares.personId, id)).get();
  if (share) return true;
  const request = db
    .select({ id: splitRequestsIn.id })
    .from(splitRequestsIn)
    .where(and(eq(splitRequestsIn.fromPersonId, id), inArray(splitRequestsIn.status, ['unattended', 'accepted'])))
    .get();
  return !!request;
}

/** Deletes the person unless something refers to them; returns whether it was deleted. */
export function deletePersonIfUnused(id: string): boolean {
  if (isPersonInUse(id)) return false;
  db.delete(persons).where(eq(persons.id, id)).run();
  return true;
}
