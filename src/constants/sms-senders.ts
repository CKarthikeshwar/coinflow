/**
 * FILE PURPOSE
 * ------------
 * The allowlist of SMS sender ids the app trusts as "this is really from a bank/payment app,"
 * plus the logic to check a given sender against it. This is the very first gate an incoming
 * SMS has to pass — see `src/domain/parser/parse-sms.ts`'s step 1 and
 * `src/services/tasks/sms-ingest.ts`'s own earlier check.
 *
 * WHERE IT FITS
 * -------------
 * `isKnownSender` is called by both `parse-sms.ts` (before any parsing work happens) and
 * `sms-ingest.ts` (even earlier, before the message is even handed to the parser) — an SMS from
 * an unrecognized sender is discarded immediately, before any attempt is made to read a
 * transaction out of it. This is what keeps random spam/marketing texts from ever being
 * considered, regardless of what they say.
 *
 * IMPORTANT
 * ---------
 * Indian transactional SMS senders use a standard DLT (Distributed Ledger Technology, a
 * telecom-regulator requirement) format like `AD-HDFCBK` or `JD-ICICIB` — a 2-letter telecom
 * prefix, a dash, then a bank/app-specific core id, sometimes with a trailing `-S`/`-T` suffix.
 * `senderCore` strips that prefix/suffix so the actual comparison is against just the
 * meaningful part (`HDFCBK`, `ICICIB`). Matching allows the core to either exactly equal a seed
 * entry OR start with one (`core.startsWith(seed)`) — this is why a seed entry like `'ICICI'`
 * also matches the real-world sender core `'ICICIB'`, without needing every possible suffix
 * variant listed explicitly. This list is a fixed, hand-curated set of common Indian
 * banks/payment apps — it is NOT user-editable in the app; expanding it means editing this file.
 */
const SENDER_SEED: readonly string[] = [
  'HDFCBK',
  'SBIINB',
  'ICICI',
  'AXISBK',
  'KOTAK',
  'PNBSMS',
  'CBSSBI',
  'BOIIND',
  'PAYTM',
  'PHONPE',
  'GPAY',
  'AMZNPY',
  'CRED',
  'BOBTXN',
  'CANBNK',
];

/** Drop the `XX-` telco prefix and a trailing `-S`/`-T`, upper-case what remains. */
function senderCore(sender: string): string {
  return sender
    .trim()
    .toUpperCase()
    .replace(/^[A-Z]{2}-/, '')
    .replace(/-[ST]$/, '');
}

/** Exact match or prefix match against the seed (e.g. `ICICIB` core matches seed `ICICI`). */
export function isKnownSender(sender: string | null | undefined): boolean {
  if (!sender) return false;
  const core = senderCore(sender);
  if (core.length < 4) return false;
  return SENDER_SEED.some((seed) => core === seed || core.startsWith(seed));
}
