/**
 * CR-34 / CR-35 — My accounts end to end, with no phone: real-shaped bank texts go through the REAL ingest task
 * (`smsIngestTask` → `parseSms` → account resolve → suggestion), get saved through the real Review Queue path
 * (`handleSaveAll`), and land in a real in-memory SQLite built from the shipped migrations. Only the OS edges are
 * faked: notifications, the split-request branch, and `ensureMigrated` (the memory DB is already migrated).
 *
 * Stands in for the multi-bank on-device checks (two banks, a credit card, a card bill) that need accounts the
 * owner does not have.
 */

import { eq } from 'drizzle-orm';

import { monthPeriod } from '@/domain/period';

import { accountsById, createAccount, getAccount, listAccounts, mergeAccounts } from '@/db/repositories/accounts';
import { acknowledgeDiscrepancy, listAccountViews } from '@/db/repositories/balances';
import { periodSummaryQuery } from '@/db/repositories/analytics';
import { listPending } from '@/db/repositories/suggestions';
import { restoreTransaction, transactionListQuery } from '@/db/repositories/transactions';
import {
  acceptCardBillHint,
  listCardBillHints,
  listTransferHints,
  softDeleteTransfer,
  unlinkTransfer,
} from '@/db/repositories/transfers';
import { suggestions, transactions, type Transaction } from '@/db/schema';
import { createMemoryDb } from '@/db/test-support/memory-db';
import { handleSaveAll } from '@/services/notifications/respond';

import { smsIngestTask } from './sms-ingest';

let mockMem: ReturnType<typeof createMemoryDb>;
let mockCounter = 0;
jest.mock('@/db/client', () => ({
  get db() {
    return mockMem.db;
  },
}));
jest.mock('@/hooks/use-live-query', () => ({ useLiveQuery: jest.fn() }));
jest.mock('expo-crypto', () => ({
  randomUUID: () => `id-${++mockCounter}`,
  CryptoDigestAlgorithm: { SHA256: 'SHA256' },
  CryptoEncoding: { HEX: 'hex' },
  digestStringAsync: async (_alg: string, material: string) =>
    (jest.requireActual('node:crypto') as typeof import('node:crypto')).createHash('sha256').update(material).digest('hex'),
}));
jest.mock('@/db/maintenance', () => ({ ensureMigrated: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/services/notifications/post', () => ({
  postForSuggestion: jest.fn().mockResolvedValue(undefined),
  cancelForSuggestion: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/services/notifications/card-bill-reminder', () => ({ scheduleCardBillReminders: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/services/notifications/reconcile', () => ({ reconcileNotifications: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/services/splits/receive-request', () => ({ handleIncomingRequest: jest.fn().mockResolvedValue(false) }));

const db = () => mockMem.db;
const T = new Date(2026, 9, 20, 10).getTime(); // 20 Oct 2026, 10:00
const HOUR = 3_600_000;

const sms = (sender: string, body: string, timestampMs: number) => smsIngestTask({ sender, body, timestampMs });
const saveAll = () => handleSaveAll({ expense: null, income: null });
const rows = () => db().select().from(transactions).all();
const byAmount = (amountMinor: number) => rows().filter((r) => r.amountMinor === amountMinor);
const get = (id: string) => db().select().from(transactions).where(eq(transactions.id, id)).get() as Transaction;
const account = (nickname: string) => listAccounts({ includeArchived: true }).find((a) => a.nickname === nickname);

beforeEach(() => {
  mockMem?.close();
  mockMem = createMemoryDb();
  mockCounter = 0;
});

describe('accounts appear from bank texts (UI-104)', () => {
  it('two banks → two accounts, each marked New, each suggestion carrying its account', async () => {
    await sms('AD-HDFCBK-S', 'Rs.450.00 debited from A/c XX1234 to VPA cafe@okhdfcbank on 20-10-26. UPI Ref 1.', T);
    await sms('VM-SBIINB-T', 'Rs.5,000.00 credited to A/c XX5678 via IMPS on 20-10-26. Ref 2.', T + HOUR);

    const hdfc = account('HDFC ··1234');
    const sbi = account('SBI ··5678');
    expect(hdfc).toMatchObject({ kind: 'bank', bankName: 'HDFC Bank', matchKey: 'hdfc:1234', autoCreated: true });
    expect(sbi).toMatchObject({ kind: 'bank', matchKey: 'sbi:5678', autoCreated: true });
    expect(listPending().map((s) => s.accountId).sort()).toEqual([hdfc!.id, sbi!.id].sort());
  });

  it('the same bank from another sender header, and the same SMS read twice, add nothing', async () => {
    await sms('AD-SBIINB-S', 'Rs.450.00 debited from A/c XX5678 to VPA cafe@oksbi. UPI Ref 1.', T);
    await sms('AD-SBIINB-S', 'Rs.450.00 debited from A/c XX5678 to VPA cafe@oksbi. UPI Ref 1.', T); // reconcile sweep
    await sms('VM-CBSSBI-T', 'Rs.99.00 debited from A/c XX5678 to VPA tea@oksbi. UPI Ref 3.', T + HOUR);
    expect(listAccounts()).toHaveLength(1);
    expect(listPending()).toHaveLength(2);
  });

  it('Canara "DEBITED to your account XXX672" → Canara ··672', async () => {
    await sms('AX-CANBNK-S', 'An amount of INR 380.00 has been DEBITED to your account XXX672 on 21/10/26. Total Avail.bal INR 3,534.65.Dial 1930 to report cyber fraud - Canara Bank', T);
    expect(account('Canara ··672')).toMatchObject({ matchKey: 'canara:672' });
  });

  it('a credit-card spend creates a card account and is a card payment', async () => {
    await sms('AD-HDFCBK-S', 'Rs.2,340.00 spent on HDFC Bank Credit Card XX4321 at BIGBASKET on 2026-10-20. Avl Limit: Rs.1,17,660.00', T);
    const card = account('HDFC ··4321');
    expect(card?.kind).toBe('credit_card');
    expect(listPending()[0]).toMatchObject({ accountId: card!.id, paymentMethod: 'card' });
  });

  it('never creates an account from an ignored text, or an app text that names no bank', async () => {
    await sms('AD-SBIINB-S', 'Dear Customer, your Avl Bal is Rs.12,340.00 as of 20-10-26.', T); // balance-only, names no account
    await sms('AD-HDFCBK-S', '453298 is your OTP for A/c XX1234. Do not share.', T); // OTP
    await sms('GPAY', 'Rs.220.00 paid to grocery@okicici via Google Pay UPI Ref 4.', T);
    expect(listAccounts()).toEqual([]);
    expect(listPending()).toHaveLength(1); // only the GPay payment, with no account
    expect(listPending()[0].accountId).toBeNull();
  });

  it('a text lands on a manually added account with the same bank and digits', async () => {
    const manual = createAccount({ kind: 'bank', nickname: 'Salary', bankName: 'HDFC Bank', last4: '1234' });
    await sms('AD-HDFCBK-S', 'Rs.450.00 debited from A/c XX1234 to VPA cafe@okhdfcbank. UPI Ref 1.', T);
    expect(listAccounts()).toHaveLength(1);
    expect(listPending()[0].accountId).toBe(manual.id);
  });
});

describe('a move between two of your accounts (UI-106)', () => {
  async function sbiToHdfc() {
    await sms('AD-SBIINB-S', 'Rs.10,000.00 debited from A/c XX5678 to VPA me@okhdfcbank on 20-10-26. UPI Ref 10.', T);
    await sms('VM-HDFCBK-T', 'Rs.10,000.00 credited to A/c XX1234 from me@oksbi UPI Ref 11.', T + 2 * 60_000);
    await saveAll();
  }

  it('saving both texts links them: one transfer, no spending, no income', async () => {
    await sbiToHdfc();
    const [a, b] = byAmount(1_000_000);
    expect(a.type).toBe('transfer');
    expect(b.type).toBe('transfer');
    expect(a.transferPeerId).toBe(b.id);
    expect(b.transferPeerId).toBe(a.id);
    expect(periodSummaryQuery(monthPeriod(T)).get()).toMatchObject({ spentMinor: 0, incomeMinor: 0 });
    expect(transactionListQuery({}).all()).toHaveLength(1); // one row in the ledger
  });

  it('Unlink makes them an expense and an income again', async () => {
    await sbiToHdfc();
    const debit = byAmount(1_000_000).find((r) => r.direction === 'debit')!;
    unlinkTransfer(debit.id);
    expect(byAmount(1_000_000).map((r) => r.type).sort()).toEqual(['expense', 'income']);
    expect(periodSummaryQuery(monthPeriod(T)).get()).toMatchObject({ spentMinor: 1_000_000, incomeMinor: 1_000_000 });
    expect(listTransferHints(T + HOUR)).toEqual([]); // not offered again
  });

  it('delete removes both halves; Undo brings both back', async () => {
    await sbiToHdfc();
    const debit = byAmount(1_000_000).find((r) => r.direction === 'debit')!;
    softDeleteTransfer(debit.id);
    expect(transactionListQuery({}).all()).toEqual([]);
    restoreTransaction(debit.id);
    expect(byAmount(1_000_000).every((r) => r.deletedAt === null && r.type === 'transfer')).toBe(true);
  });

  it('more than 15 minutes apart: two ordinary transactions', async () => {
    await sms('AD-SBIINB-S', 'Rs.10,000.00 debited from A/c XX5678 to VPA me@okhdfcbank. UPI Ref 10.', T);
    await sms('VM-HDFCBK-T', 'Rs.10,000.00 credited to A/c XX1234 from me@oksbi UPI Ref 11.', T + 16 * 60_000);
    await saveAll();
    expect(byAmount(1_000_000).map((r) => r.type).sort()).toEqual(['expense', 'income']);
  });

  it('two possible matches: nothing is linked, the Review Queue asks', async () => {
    await sms('AD-HDFCBK-S', 'Rs.500.00 debited from A/c XX1234 to VPA x@okaxis. UPI Ref 20.', T);
    await sms('VM-SBIINB-T', 'Rs.500.00 credited to A/c XX5678 via IMPS. Ref 21.', T + 60_000);
    await sms('AX-CANBNK-S', 'An amount of INR 500.00 has been CREDITED to your account XXX672 on 20/10/26 - Canara Bank', T + 120_000);
    await saveAll();
    expect(byAmount(50_000).every((r) => r.transferPeerId === null)).toBe(true);
    expect(listTransferHints(T + HOUR)).toHaveLength(2); // HDFC → SBI? and HDFC → Canara? — the user picks
  });
});

describe('credit card bill (UI-108)', () => {
  it('a bank debit that pays your card becomes a bill payment on Yes — not spending', async () => {
    await sms('AD-HDFCBK-S', 'Rs.2,340.00 spent on HDFC Bank Credit Card XX4321 at BIGBASKET. Avl Limit: Rs.1,17,660.00', T);
    await saveAll(); // the card account now exists
    await sms('AD-SBIINB-S', 'Rs.14,200.00 debited from A/c XX5678 towards HDFC Bank Credit Card XX4321 payment on 25-10-26. Ref 30.', T + 5 * HOUR);
    expect(listCardBillHints(T + 5 * HOUR)).toEqual([]); // still pending in the queue
    await saveAll();

    const hints = listCardBillHints(T + 5 * HOUR);
    expect(hints).toHaveLength(1);
    expect(accountsById([hints[0].cardAccountId]).get(hints[0].cardAccountId)?.kind).toBe('credit_card');
    expect(hints[0].row.accountId).toBe(account('SBI ··5678')!.id);

    acceptCardBillHint(hints[0]);
    expect(get(hints[0].row.id)).toMatchObject({ type: 'transfer', transferPeerId: null });
    expect(periodSummaryQuery(monthPeriod(T)).get()?.spentMinor).toBe(234_000); // only the card spend
  });
});

describe('merge (UI-103a)', () => {
  it('one account seen twice (3- and 4-digit masks) merges into one, history and pending texts included', async () => {
    await sms('AX-CANBNK-S', 'An amount of INR 380.00 has been DEBITED to your account XXX672 on 21/10/26 - Canara Bank', T);
    await saveAll();
    await sms('AX-CANBNK-S', 'Dear Customer, Acct XXXX9672 Dr. INR 140.00 on 22/10/26 to Sample Person; UPI: 1. -CanaraBank', T + HOUR);
    const short = account('Canara ··672')!;
    const long = account('Canara ··9672')!;

    mergeAccounts(long.id, short.id);

    expect(listAccounts().map((a) => a.id)).toEqual([short.id]);
    expect(rows().every((r) => r.accountId === short.id)).toBe(true);
    expect(db().select().from(suggestions).where(eq(suggestions.status, 'pending')).get()?.accountId).toBe(short.id);
    // a later text with the merged-away mask creates it again — merge cannot know both keys (expected, §46.12)
  });
});


describe('balances from bank texts (phase D)', () => {
  const viewOf = (nickname: string, now = T + 10 * HOUR) => listAccountViews({ now }).find((v) => v.account.nickname === nickname)!;

  it('"Avl Bal" anchors the balance; later rows move it; the figure counts while the text is still pending', async () => {
    await sms('AX-CANBNK-S', 'An amount of INR 380.00 has been DEBITED to your account XXX672 on 21/10/26. Total Avail.bal INR 3,534.65.Dial 1930 to report cyber fraud - Canara Bank', T);
    expect(viewOf('Canara ··672').balance).toEqual({ balanceMinor: 3_534_65, asOf: T }); // still in the Review Queue
    await saveAll();
    await sms('AX-CANBNK-S', 'An amount of INR 100.00 has been DEBITED to your account XXX672 on 21/10/26 - Canara Bank', T + HOUR);
    expect(viewOf('Canara ··672').balance).toEqual({ balanceMinor: 3_434_65, asOf: T });
    expect(viewOf('Canara ··672').discrepancies).toEqual([]);
  });

  it('a balance-only text is a snapshot, not a transaction', async () => {
    await sms('AD-SBIINB-S', 'Your A/c XX5678 Avl Bal is Rs.12,340.00 as of 20-10-26.', T);
    expect(listPending()).toEqual([]);
    expect(viewOf('SBI ··5678').balance?.balanceMinor).toBe(12_340_00);
  });

  it("money the balance says left but nothing recorded ⇒ Needs a look; adding it clears it; It's fine hides it", async () => {
    await sms('AD-SBIINB-S', 'Your A/c XX5678 Avl Bal is Rs.10,000.00 as of 20-10-26.', T);
    await sms('AD-SBIINB-S', 'Rs.500.00 debited from A/c XX5678 to VPA cafe@oksbi. UPI Ref 40. Avl Bal Rs.8,300.00', T + 5 * HOUR);
    const [gap] = viewOf('SBI ··5678').discrepancies;
    expect(gap.diffMinor).toBe(-1_200_00); // ₹10,000 − ₹500 − ₹8,300 = ₹1,200 unexplained

    // the missing ATM withdrawal, added by hand on that account
    insertManual({ accountId: account('SBI ··5678')!.id, amountMinor: 1_200_00, direction: 'debit', occurredAt: T + 2 * HOUR });
    expect(viewOf('SBI ··5678').discrepancies).toEqual([]);

    await sms('AD-SBIINB-S', 'Rs.50.00 debited from A/c XX5678 to VPA tea@oksbi. UPI Ref 41. Avl Bal Rs.8,000.00', T + 6 * HOUR);
    const [second] = viewOf('SBI ··5678').discrepancies;
    expect(second.diffMinor).toBe(-250_00);
    acknowledgeDiscrepancy(second.snapshotId);
    expect(viewOf('SBI ··5678').discrepancies).toEqual([]);
    expect(viewOf('SBI ··5678').balance?.balanceMinor).toBe(8_000_00);
  });

  it('a transfer keeps both balances right and Needs a look quiet', async () => {
    await sms('AD-SBIINB-S', 'Your A/c XX5678 Avl Bal is Rs.20,000.00.', T - HOUR);
    await sms('VM-HDFCBK-T', 'Your A/c XX1234 Avl Bal is Rs.1,000.00.', T - HOUR);
    await sms('AD-SBIINB-S', 'Rs.10,000.00 debited from A/c XX5678 to VPA me@okhdfcbank. UPI Ref 10. Avl Bal Rs.10,000.00', T);
    await sms('VM-HDFCBK-T', 'Rs.10,000.00 credited to A/c XX1234 from me@oksbi UPI Ref 11. Avl Bal Rs.11,000.00', T + 60_000);
    await saveAll();
    expect(byAmount(1_000_000).every((r) => r.type === 'transfer')).toBe(true);
    expect(viewOf('SBI ··5678')).toMatchObject({ balance: { balanceMinor: 10_000_00 }, discrepancies: [] });
    expect(viewOf('HDFC ··1234')).toMatchObject({ balance: { balanceMinor: 11_000_00 }, discrepancies: [] });
  });
});

describe('card statements (phase E)', () => {
  it('a statement sets the card bill; an older statement re-read never rolls it back', async () => {
    await sms('AD-HDFCBK-S', 'Rs.2,340.00 spent on HDFC Bank Credit Card XX4321 at BIGBASKET. Avl Limit: Rs.1,17,660.00', T);
    await sms('AD-HDFCBK-S', 'Your HDFC Bank Credit Card XX4321 statement: Total due Rs.14,200.00, minimum due Rs.710.00, due date 05-Nov-26.', T + HOUR);
    const card = account('HDFC ··4321')!;
    expect(getAccount(card.id)).toMatchObject({ dueAmountMinor: 14_200_00, dueAt: new Date(2026, 10, 5).getTime() });

    await sms('AD-HDFCBK-S', 'Your HDFC Bank Credit Card XX4321 statement: Total due Rs.9,000.00, due date 05-Oct-26.', T + 2 * HOUR);
    expect(getAccount(card.id)?.dueAmountMinor).toBe(14_200_00);
    expect(listPending()).toHaveLength(1); // only the spend — statements are not transactions
  });
});

function insertManual(row: { accountId: string; amountMinor: number; direction: 'debit' | 'credit'; occurredAt: number }) {
  db().insert(transactions).values({
    id: `manual-${row.occurredAt}`,
    amountMinor: row.amountMinor,
    direction: row.direction,
    type: row.direction === 'credit' ? 'income' : 'expense',
    occurredAt: row.occurredAt,
    source: 'manual',
    createdAt: row.occurredAt,
    updatedAt: row.occurredAt,
    accountId: row.accountId,
  }).run();
}
