/**
 * FILE PURPOSE
 * ------------
 * The only place in the app that touches the device's contacts (SPEC-implementation.md §43, IMP-098). Used by the
 * Split sheet's People stage so the user can pick who to ask instead of typing a number.
 *
 * WHERE IT FITS
 * -------------
 * `expo-contacts` in SDK 57 exposes a new object API at the package root whose *old* functions throw at runtime;
 * the classic ones live at `expo-contacts/legacy` (phase-0 spike, §45.5) — that import lives here and nowhere else.
 * There is a `.web.ts` sibling that returns "no access, no contacts", like every other native wrapper here.
 *
 * PRIVACY (P-9 / IMP-098)
 * -----------------------
 * - `READ_CONTACTS` is **optional** and asked for **just in time** — only when the user opens the Contacts section;
 *   everything else in the Split sheet works without it.
 * - The app never holds `WRITE_CONTACTS` (`android.blockedPermissions` in `app.json` removes what the plugin adds).
 * - Contacts are read into memory for the picker only. Nothing is stored except the one name + number the user
 *   actually picks, which becomes an ordinary `person` row.
 */

import * as Contacts from 'expo-contacts/legacy';

import { normalizePhone } from '@/domain/person';

/** One pickable contact: a name and one Indian mobile number we could actually text. */
export type ContactCandidate = {
  /** The device contact's id — kept on the person row as `contactRef` if picked. */
  contactRef: string;
  name: string;
  phoneKey: string;
  phoneDisplay: string;
};

export type ContactsAccess = 'granted' | 'denied' | 'blocked' | 'unsupported';

function toAccess(response: { granted: boolean; canAskAgain: boolean }): ContactsAccess {
  if (response.granted) return 'granted';
  return response.canAskAgain ? 'denied' : 'blocked';
}

/** Current access, without prompting. */
export async function getContactsAccess(): Promise<ContactsAccess> {
  try {
    return toAccess(await Contacts.getPermissionsAsync());
  } catch {
    return 'unsupported';
  }
}

/** The just-in-time prompt (only ever called from the user tapping "Choose from contacts"). */
export async function requestContactsAccess(): Promise<ContactsAccess> {
  try {
    return toAccess(await Contacts.requestPermissionsAsync());
  } catch {
    return 'unsupported';
  }
}

/**
 * Every contact with at least one valid 10-digit Indian mobile number, one entry per number, sorted by name.
 * Duplicate numbers collapse to the first contact that has them (the same rule as person identity, IMP-077).
 */
export async function listContactCandidates(): Promise<ContactCandidate[]> {
  // `id` is present on the rows the legacy API returns but is not in its `Contact` type.
  let data: (Contacts.Contact & { id?: string })[] = [];
  try {
    ({ data } = await Contacts.getContactsAsync({ fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers] }));
  } catch {
    return [];
  }

  const byKey = new Map<string, ContactCandidate>();
  for (const contact of data) {
    for (const entry of contact.phoneNumbers ?? []) {
      const phone = normalizePhone(entry.number);
      if (!phone || byKey.has(phone.phoneKey)) continue;
      byKey.set(phone.phoneKey, {
        contactRef: contact.id ?? phone.phoneKey,
        name: contact.name?.trim() || phone.phoneDisplay,
        phoneKey: phone.phoneKey,
        phoneDisplay: phone.phoneDisplay,
      });
    }
  }
  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
}
