/**
 * Curated bank / UPI sender seed — SPEC-implementation.md §23.2. Indian transactional SMS
 * come from 6-char DLT header ids (`AD-HDFCBK`, `VM-SBIINB`, `JD-ICICIB`, `BZ-PAYTMB`, …).
 * Code-versioned, not user-editable in V1; expansion from real-world senders is Future (§14).
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
