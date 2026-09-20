/**
 * Web build's replacement for `contacts.ts` — there are no device contacts in a browser, and importing
 * `expo-contacts/legacy` here would pull native code into the web bundle. Callers get "no access, no contacts"
 * and fall back to typing a number, exactly as on a phone where the permission was refused.
 */

export type ContactCandidate = {
  contactRef: string;
  name: string;
  phoneKey: string;
  phoneDisplay: string;
};

export type ContactsAccess = 'granted' | 'denied' | 'blocked' | 'unsupported';

export async function getContactsAccess(): Promise<ContactsAccess> {
  return 'unsupported';
}

export async function requestContactsAccess(): Promise<ContactsAccess> {
  return 'unsupported';
}

export async function listContactCandidates(): Promise<ContactCandidate[]> {
  return [];
}
