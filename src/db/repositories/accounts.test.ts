/**
 * §46.7 accountRepo against real in-memory SQLite: create / edit / archive / merge, and the SMS resolve-or-create
 * used at ingest (§46.5).
 */

import { eq } from 'drizzle-orm';

import { accountBalances, myAccounts, suggestions, transactions } from '../schema';
import { insertTransaction } from '../test-support/fixtures';
import { createMemoryDb } from '../test-support/memory-db';
import {
  archiveAccount,
  cleanLast4,
  createAccount,
  DuplicateAccountError,
  getAccount,
  lastUsedAccountForMethod,
  listAccounts,
  listCardLast4s,
  markAccountSeen,
  mergeAccounts,
  resolveAccountFromSms,
  unarchiveAccount,
  updateAccount,
} from './accounts';
import { createTransfer } from './transfers';

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
const hdfc672 = { bankKey: 'hdfc', bankName: 'HDFC Bank', last4: '672', kind: 'bank' as const };

beforeEach(() => {
  mockMem?.close();
  mockMem = createMemoryDb();
  mockCounter = 0;
});

describe('resolveAccountFromSms (§46.5)', () => {
  it('creates the account on first sight, named "HDFC ··672", marked New', () => {
    const { id, created } = resolveAccountFromSms(hdfc672);
    expect(created).toBe(true);
    expect(getAccount(id)).toMatchObject({
      kind: 'bank',
      nickname: 'HDFC ··672',
      bankName: 'HDFC Bank',
      bankKey: 'hdfc',
      last4: '672',
      matchKey: 'hdfc:672',
      autoCreated: true,
    });
  });

  it('finds the same account the second time', () => {
    const first = resolveAccountFromSms(hdfc672);
    const second = resolveAccountFromSms(hdfc672);
    expect(second).toEqual({ id: first.id, created: false });
    expect(listAccounts()).toHaveLength(1);
  });

  it('a credit card SMS creates a card account', () => {
    const { id } = resolveAccountFromSms({ ...hdfc672, last4: '4321', kind: 'credit_card' });
    expect(getAccount(id)?.kind).toBe('credit_card');
  });

  it('lands on a manually added account with the same bank name + digits', () => {
    const manual = createAccount({ kind: 'bank', nickname: 'Salary – HDFC', bankName: 'HDFC Bank', last4: '672' });
    expect(manual.matchKey).toBe('hdfc:672');
    expect(resolveAccountFromSms(hdfc672)).toEqual({ id: manual.id, created: false });
  });
});

describe('create / update', () => {
  it('keeps only the last four digits', () => {
    expect(cleanLast4('XX 12345678')).toBe('5678');
    expect(cleanLast4('')).toBeNull();
    expect(createAccount({ kind: 'bank', nickname: 'X', bankName: 'SBI', last4: '1234567' }).last4).toBe('4567');
  });

  it('cash never gets a match key', () => {
    expect(createAccount({ kind: 'cash', nickname: 'Cash', last4: '12' }).matchKey).toBeNull();
  });

  it('refuses a second account with the same bank + digits', () => {
    const a = createAccount({ kind: 'bank', nickname: 'A', bankName: 'SBI', last4: '1234' });
    expect(() => createAccount({ kind: 'bank', nickname: 'B', bankName: 'State Bank', last4: '1234' })).toThrow(DuplicateAccountError);
    const b = createAccount({ kind: 'bank', nickname: 'B', bankName: 'SBI', last4: '9999' });
    expect(() => updateAccount(b.id, { last4: '1234' })).toThrow(DuplicateAccountError);
    expect(getAccount(a.id)?.nickname).toBe('A');
  });

  it('editing renames, re-keys and clears the New pill', () => {
    const { id } = resolveAccountFromSms(hdfc672);
    updateAccount(id, { nickname: 'Salary', last4: '9672' });
    expect(getAccount(id)).toMatchObject({ nickname: 'Salary', last4: '9672', matchKey: 'hdfc:9672', autoCreated: false });
  });

  it('a blank nickname keeps the old one', () => {
    const { id } = resolveAccountFromSms(hdfc672);
    updateAccount(id, { nickname: '  ' });
    expect(getAccount(id)?.nickname).toBe('HDFC ··672');
  });

  it('markAccountSeen / archive / unarchive', () => {
    const { id } = resolveAccountFromSms(hdfc672);
    markAccountSeen(id);
    expect(getAccount(id)?.autoCreated).toBe(false);
    archiveAccount(id);
    expect(listAccounts()).toEqual([]);
    expect(listAccounts({ includeArchived: true })).toHaveLength(1);
    unarchiveAccount(id);
    expect(listAccounts()).toHaveLength(1);
  });

  it('lists in section order: bank, cards, wallets, cash', () => {
    createAccount({ kind: 'cash', nickname: 'Cash' });
    createAccount({ kind: 'wallet', nickname: 'Paytm' });
    createAccount({ kind: 'credit_card', nickname: 'Card' });
    createAccount({ kind: 'bank', nickname: 'Bank' });
    expect(listAccounts().map((a) => a.kind)).toEqual(['bank', 'credit_card', 'wallet', 'cash']);
  });
});

describe('mergeAccounts (§46.7)', () => {
  it('moves transactions, suggestions and balances, keeps the target nickname, deletes the source', () => {
    const into = createAccount({ kind: 'bank', nickname: 'Salary', bankName: 'Canara', last4: '672' });
    const from = resolveAccountFromSms({ bankKey: 'canara', bankName: 'Canara Bank', last4: '9672', kind: 'bank' });
    insertTransaction(db(), { id: 't1', accountId: from.id });
    db().insert(suggestions).values({ id: 's1', smsSender: 'X', smsReceivedAt: 1, dedupeKey: 'k', createdAt: 1, accountId: from.id }).run();
    db().insert(accountBalances).values({ id: 'b1', accountId: from.id, balanceMinor: 5, asOf: 1, source: 'sms', dedupeKey: 'x' }).run();

    mergeAccounts(from.id, into.id);

    expect(getAccount(from.id)).toBeNull();
    expect(getAccount(into.id)?.nickname).toBe('Salary');
    expect(db().select().from(transactions).where(eq(transactions.id, 't1')).get()?.accountId).toBe(into.id);
    expect(db().select().from(suggestions).get()?.accountId).toBe(into.id);
    expect(db().select().from(accountBalances).get()?.accountId).toBe(into.id);
  });

  it('a transfer between the two merged accounts stops being a transfer', () => {
    const a = createAccount({ kind: 'bank', nickname: 'A' });
    const b = createAccount({ kind: 'bank', nickname: 'B' });
    const { outId, inId } = createTransfer({ fromId: a.id, toId: b.id, amountMinor: 500, occurredAt: 1 });
    mergeAccounts(a.id, b.id);
    const rows = db().select().from(transactions).all();
    expect(rows.find((r) => r.id === outId)).toMatchObject({ type: 'expense', transferPeerId: null, accountId: b.id });
    expect(rows.find((r) => r.id === inId)).toMatchObject({ type: 'income', transferPeerId: null });
  });

  it('the kept account inherits digits it lacked', () => {
    const into = createAccount({ kind: 'wallet', nickname: 'Paytm' });
    const from = createAccount({ kind: 'wallet', nickname: 'P2', bankName: 'HDFC', last4: '11' });
    mergeAccounts(from.id, into.id);
    expect(getAccount(into.id)?.last4).toBe('11');
    expect(db().select().from(myAccounts).all()).toHaveLength(1);
  });
});

describe('lookups', () => {
  it('lastUsedAccountForMethod — the newest row with that method and an account', () => {
    const a = createAccount({ kind: 'bank', nickname: 'A' });
    const b = createAccount({ kind: 'bank', nickname: 'B' });
    insertTransaction(db(), { paymentMethod: 'upi', accountId: a.id, occurredAt: 10 });
    insertTransaction(db(), { paymentMethod: 'upi', accountId: b.id, occurredAt: 20 });
    insertTransaction(db(), { paymentMethod: 'upi', accountId: null, occurredAt: 30 });
    insertTransaction(db(), { paymentMethod: 'cash', accountId: a.id, occurredAt: 40 });
    expect(lastUsedAccountForMethod('upi')).toBe(b.id);
    expect(lastUsedAccountForMethod('wallet')).toBeNull();
    expect(lastUsedAccountForMethod(null)).toBeNull();
  });

  it('listCardLast4s — live cards with digits only', () => {
    const card = createAccount({ kind: 'credit_card', nickname: 'C', bankName: 'HDFC', last4: '4321' });
    createAccount({ kind: 'credit_card', nickname: 'No digits' });
    const old = createAccount({ kind: 'credit_card', nickname: 'Old', bankName: 'SBI', last4: '1111' });
    archiveAccount(old.id);
    expect(listCardLast4s()).toEqual([{ id: card.id, last4: '4321' }]);
  });
});
