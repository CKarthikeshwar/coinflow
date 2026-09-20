/**
 * FILE PURPOSE
 * ------------
 * The **request branch** of SMS ingest (SPEC-implementation.md §42.2, IMP-079/080/082/088): decides whether an
 * incoming text is a CoinFlow split request and, if so, records it and announces it.
 *
 * WHERE IT FITS
 * -------------
 * Called first thing by `smsIngestTask` (`src/services/tasks/sms-ingest.ts`), *before* the bank-sender gate,
 * from every path that can see an incoming SMS (broadcast, store watcher, app-open and periodic sweeps).
 * When it returns `true` the message has been dealt with and ingest **stops** — a request is never also a bank
 * suggestion. When it returns `false` ingest carries on exactly as in V1.
 *
 * THE RULES (untrusted input, D40 / D46)
 * --------------------------------------
 * - only a **numeric** sender (a phone number) can send a request — every bank uses an alphanumeric sender ID,
 *   so a bank text can never be mistaken for one;
 * - the token must match the strict pattern (`decodeRequest`); anything else falls through untouched;
 * - `receiveRequest` (repository) enforces bounds, idempotency per (sender, ref), and the rate limits;
 * - the SMS body is never stored or logged — only ref / amount / note / sender number (P-9);
 * - nothing is ever accepted, paid or replied to automatically.
 *
 * Only the **inbox** is ever read (the broadcast and the sweeps are inbox-only), so the request text this
 * phone itself sends is not re-ingested.
 */

import { ensureMigrated } from '@/db/maintenance';
import { receiveRequest } from '@/db/repositories/split-requests';
import { isPhoneNumberSender } from '@/domain/person';
import { decodeRequest } from '@/domain/split-message';
import { cancelForRequest, postForRequest } from '@/services/notifications/split-post';

export type IncomingSms = { sender: string; body: string };

/**
 * Handles one incoming SMS if — and only if — it is a split request. Returns `true` when the message was a
 * request (whether or not it changed anything: a duplicate, a rate-limited or an out-of-bounds one still
 * counts, it must not fall through to the bank path), `false` otherwise.
 */
export async function handleIncomingRequest(sms: IncomingSms, options: { notify: boolean }): Promise<boolean> {
  if (!isPhoneNumberSender(sms.sender)) return false;
  const decoded = decodeRequest(sms.body);
  if (!decoded) return false;

  await ensureMigrated();
  const result = receiveRequest({
    fromPhone: sms.sender,
    ref: decoded.ref,
    amountMinor: decoded.amountMinor,
    note: decoded.note,
  });

  if (options.notify) {
    if (result.kind === 'created' || result.kind === 'updated') {
      // `updated` refreshes the same notification (same identifier) with the new amount — including for a request
      // already accepted, which the sender can still change (§42.2): what you owe never changes silently.
      await postForRequest(result.request);
    } else if (result.kind === 'withdrawn') {
      await cancelForRequest(result.request.id); // the sender cancelled: take it off the shade
    }
  }
  return true;
}
