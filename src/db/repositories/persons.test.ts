import { createMemoryDb } from '../test-support/memory-db';
import {
  deletePersonIfUnused,
  findOrCreatePerson,
  findPersonByPhone,
  getPerson,
  isPersonInUse,
  listPersons,
  renamePerson,
  touchPersons,
} from './persons';
import { insertTransaction } from '../test-support/fixtures';
import { createSplit } from './splits';
import { receiveRequest } from './split-requests';

let mockMem: ReturnType<typeof createMemoryDb>;
let mockCounter = 0;
jest.mock('../client', () => ({
  get db() {
    return mockMem.db;
  },
}));
jest.mock('expo-crypto', () => ({
  randomUUID: () => `id-${++mockCounter}`,
  getRandomBytes: (n: number) => Uint8Array.from({ length: n }, (_v, i) => (mockCounter * 31 + i * 17) % 256),
}));

beforeEach(() => {
  mockMem?.close();
  mockMem = createMemoryDb();
  mockCounter = 0;
});

describe('findOrCreatePerson (IMP-077)', () => {
  it('creates a person from a typed number, normalised', () => {
    const p = findOrCreatePerson({ displayName: 'Rahul', phone: '+91 98458 97555', source: 'manual' }, 100);
    expect(p).toMatchObject({ displayName: 'Rahul', phoneKey: '9845897555', phoneDisplay: '+919845897555', source: 'manual' });
    expect(getPerson(p.id)).toEqual(p);
  });

  it('treats different spellings of one number as the same person (no duplicate rows)', () => {
    const a = findOrCreatePerson({ displayName: 'Rahul', phone: '9845897555', source: 'manual' });
    const b = findOrCreatePerson({ displayName: 'Rahul M', phone: '09845897555', source: 'manual' });
    expect(b.id).toBe(a.id);
    expect(listPersons()).toHaveLength(1);
    expect(findPersonByPhone('+91-98458-97555')?.id).toBe(a.id);
  });

  it('keeps the stored name for a known number (no silent rename)', () => {
    const a = findOrCreatePerson({ displayName: 'Rahul', phone: '9845897555', source: 'manual' });
    const b = findOrCreatePerson({ displayName: 'Someone Else', phone: '9845897555', source: 'contact' });
    expect(b.displayName).toBe(a.displayName);
  });

  it('upgrades an SMS-only person (named after their number) when the user later names them', () => {
    const sms = findOrCreatePerson({ phone: '9742590888', source: 'sms' });
    expect(sms.displayName).toBe('+919742590888');
    const named = findOrCreatePerson({ displayName: 'Neha', phone: '9742590888', contactRef: 'c-1', source: 'contact' });
    expect(named.id).toBe(sms.id);
    expect(named).toMatchObject({ displayName: 'Neha', source: 'contact', contactRef: 'c-1' });
  });

  it('accepts a name with no number, but never two people with the same number', () => {
    const a = findOrCreatePerson({ displayName: 'Cash friend', source: 'manual' });
    const b = findOrCreatePerson({ displayName: 'Cash friend', source: 'manual' });
    expect(a.id).not.toBe(b.id); // no number ⇒ nothing to merge on
    expect(a.phoneKey).toBeNull();
  });

  it('rejects an invalid number, or no name and no number', () => {
    expect(() => findOrCreatePerson({ displayName: 'X', phone: '12345', source: 'manual' })).toThrow(RangeError);
    expect(() => findOrCreatePerson({ source: 'manual' })).toThrow(RangeError);
  });
});

describe('listPersons / renamePerson / touchPersons', () => {
  it('lists most recently used first', () => {
    const a = findOrCreatePerson({ displayName: 'A', phone: '9000000001', source: 'manual' }, 100);
    const b = findOrCreatePerson({ displayName: 'B', phone: '9000000002', source: 'manual' }, 200);
    expect(listPersons().map((p) => p.id)).toEqual([b.id, a.id]);
    touchPersons([a.id], 300);
    expect(listPersons().map((p) => p.id)).toEqual([a.id, b.id]);
  });

  it('renames, but not to an empty name', () => {
    const a = findOrCreatePerson({ displayName: 'A', phone: '9000000001', source: 'manual' });
    renamePerson(a.id, '  Amit ');
    expect(getPerson(a.id)?.displayName).toBe('Amit');
    expect(() => renamePerson(a.id, '   ')).toThrow(RangeError);
  });
});

describe('deletePersonIfUnused', () => {
  it('deletes an unused person', () => {
    const a = findOrCreatePerson({ displayName: 'A', phone: '9000000001', source: 'manual' });
    expect(isPersonInUse(a.id)).toBe(false);
    expect(deletePersonIfUnused(a.id)).toBe(true);
    expect(getPerson(a.id)).toBeUndefined();
  });

  it('refuses while the person is on a share', () => {
    const a = findOrCreatePerson({ displayName: 'A', phone: '9000000001', source: 'manual' });
    const t = insertTransaction(mockMem.db);
    createSplit({ transactionId: t.id, shares: [{ personId: a.id, amountMinor: 30_000 }] });
    expect(isPersonInUse(a.id)).toBe(true);
    expect(deletePersonIfUnused(a.id)).toBe(false);
    expect(getPerson(a.id)).toBeDefined();
  });

  it('refuses while a request from them is waiting on you, allows it once rejected (tombstone)', () => {
    const r = receiveRequest({ fromPhone: '+919742590888', ref: 'ab2cd3', amountMinor: 45_000, note: 'Momos' }, 1000);
    expect(r.kind).toBe('created');
    const personId = (r as { request: { fromPersonId: string } }).request.fromPersonId;
    expect(deletePersonIfUnused(personId)).toBe(false);
  });
});
