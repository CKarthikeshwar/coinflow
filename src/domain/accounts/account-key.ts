/**
 * FILE PURPOSE
 * ------------
 * Which bank an SMS came from, as one stable key (`hdfc`, `sbi`, …), and the `bankKey:last4` match key that identifies
 * one of the user's own accounts (SPEC-implementation.md §46.3, D46). Banks send from several DLT headers — HDFC as
 * `HDFCBK` *and* `HDFCBN`, SBI as `SBIINB` / `SBIPSG` / `SBIUPI` / `CBSSBI` — so the header alone would split one bank
 * into several. An unknown header still works: it becomes its own lower-cased key, just without a pretty name.
 *
 * Payment *apps* (GPay, PhonePe, CRED, Paytm) are not where the money sits: for them the bank is read from the body
 * ("… from HDFC Bank A/c XX1234") and, failing that, there is no account at all — never an account called "GPay".
 *
 * Pure — no React Native / database imports.
 */

type Bank = { key: string; name: string; short: string };

const BANKS: Record<string, Bank> = {
  hdfc: { key: 'hdfc', name: 'HDFC Bank', short: 'HDFC' },
  sbi: { key: 'sbi', name: 'State Bank of India', short: 'SBI' },
  icici: { key: 'icici', name: 'ICICI Bank', short: 'ICICI' },
  axis: { key: 'axis', name: 'Axis Bank', short: 'Axis' },
  kotak: { key: 'kotak', name: 'Kotak Mahindra Bank', short: 'Kotak' },
  canara: { key: 'canara', name: 'Canara Bank', short: 'Canara' },
  pnb: { key: 'pnb', name: 'Punjab National Bank', short: 'PNB' },
  boi: { key: 'boi', name: 'Bank of India', short: 'BOI' },
  bob: { key: 'bob', name: 'Bank of Baroda', short: 'BOB' },
  yes: { key: 'yes', name: 'Yes Bank', short: 'Yes' },
  idfc: { key: 'idfc', name: 'IDFC First Bank', short: 'IDFC' },
  indusind: { key: 'indusind', name: 'IndusInd Bank', short: 'IndusInd' },
  federal: { key: 'federal', name: 'Federal Bank', short: 'Federal' },
  amazonpay: { key: 'amazonpay', name: 'Amazon Pay', short: 'Amazon Pay' },
};

/** DLT header core → bank key. Prefix match, longest first (so `ICICIB` and `ICICIT` both map to icici). */
const HEADER_TO_BANK: readonly [string, string][] = [
  ['HDFCBK', 'hdfc'],
  ['HDFCBN', 'hdfc'],
  ['HDFC', 'hdfc'],
  ['SBIINB', 'sbi'],
  ['SBIPSG', 'sbi'],
  ['SBIUPI', 'sbi'],
  ['CBSSBI', 'sbi'],
  ['SBI', 'sbi'],
  ['ICICI', 'icici'],
  ['AXISBK', 'axis'],
  ['AXIS', 'axis'],
  ['KOTAK', 'kotak'],
  ['CANBNK', 'canara'],
  ['PNBSMS', 'pnb'],
  ['BOIIND', 'boi'],
  ['BOBTXN', 'bob'],
  ['YESBNK', 'yes'],
  ['IDFCFB', 'idfc'],
  ['INDUSB', 'indusind'],
  ['FEDBNK', 'federal'],
  ['AMZNPY', 'amazonpay'],
];

/** Senders that are apps moving money between banks — the bank must come from the body. */
const APP_HEADERS: readonly string[] = ['GPAY', 'PHONPE', 'CRED', 'PAYTM'];

/** Bank names as written in SMS bodies, for app senders. Order matters: longer / more specific first. */
const BODY_BANKS: readonly [RegExp, string][] = [
  [/\bhdfc\b/i, 'hdfc'],
  [/\b(?:sbi|state bank)\b/i, 'sbi'],
  [/\bicici\b/i, 'icici'],
  [/\baxis\b/i, 'axis'],
  [/\bkotak\b/i, 'kotak'],
  [/\bcanara\b/i, 'canara'],
  [/\b(?:pnb|punjab national)\b/i, 'pnb'],
  [/\bbank of baroda\b/i, 'bob'],
  [/\bbank of india\b/i, 'boi'],
  [/\byes bank\b/i, 'yes'],
  [/\bidfc\b/i, 'idfc'],
  [/\bindusind\b/i, 'indusind'],
  [/\bfederal bank\b/i, 'federal'],
];

/** `AX-HDFCBK-S` → `HDFCBK`: drops the 2-letter telco prefix and a one-letter type suffix. */
export function senderCore(sender: string): string {
  return sender
    .trim()
    .toUpperCase()
    .replace(/^[A-Z]{2}-/, '')
    .replace(/-[A-Z]$/, '');
}

export type BankRef = { bankKey: string; bankName: string | null };

/**
 * The bank behind an SMS: from the sender header, or — for a payment app — from a bank name in the body.
 * `null` when it cannot be told (an app message that names no bank).
 */
export function bankFromSms(sender: string, body: string): BankRef | null {
  const core = senderCore(sender);
  if (!core) return null;
  if (APP_HEADERS.some((app) => core.startsWith(app))) {
    const hit = BODY_BANKS.find(([re]) => re.test(body));
    return hit ? { bankKey: hit[1], bankName: BANKS[hit[1]]?.name ?? null } : null;
  }
  const mapped = HEADER_TO_BANK.find(([prefix]) => core.startsWith(prefix));
  if (mapped) return { bankKey: mapped[1], bankName: BANKS[mapped[1]]?.name ?? null };
  return { bankKey: core.toLowerCase(), bankName: null };
}

/** §46.3 `bankKeyFromSender` — just the key. */
export function bankKeyFromSender(sender: string): string | null {
  return bankFromSms(sender, '')?.bankKey ?? null;
}

/** D46 — the identity of an SMS-detected account. */
export function matchKey(bankKey: string, last4: string): string {
  return `${bankKey}:${last4}`;
}

/** "HDFC" for a known bank, else the key upper-cased ("ABCBNK"). */
export function bankShortName(bankKey: string | null | undefined): string | null {
  if (!bankKey) return null;
  return BANKS[bankKey]?.short ?? bankKey.toUpperCase();
}

/** The auto-created nickname / fallback label: "HDFC ··672". */
export function defaultNickname(bankKey: string | null | undefined, last4: string | null | undefined): string {
  const bank = bankShortName(bankKey);
  if (bank && last4) return `${bank} ··${last4}`;
  return bank ?? (last4 ? `··${last4}` : 'Account');
}

/** A typed bank name ("HDFC Bank", "sbi") → its key, so a manually added account is matched by later SMS. */
export function bankKeyFromName(name: string | null | undefined): string | null {
  if (!name?.trim()) return null;
  return BODY_BANKS.find(([re]) => re.test(name))?.[1] ?? null;
}
