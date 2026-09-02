/**
 * `SMS_INGEST_TASK` body (SPEC-implementation.md §17.3, steps 1–5 — F1 scope).
 *
 * Steps 6 (account-rule lookup) / 7 (notify) / 8 (self-heal) belong to F2/F11 and are not run
 * here yet — F1 ends at "create one Suggestion in the pending queue" (§2 F1).
 *
 * Contract that holds throughout: runs with no UI, opens `expo-sqlite` itself, never logs the
 * body / amount / account, and never throws out of `smsIngestTask` (§17.2 / §32 E1/E2).
 */

import * as Crypto from 'expo-crypto';

import { isKnownSender } from '@/constants/sms-senders';
import { ensureMigrated } from '@/db/maintenance';
import { insertIfNew } from '@/db/repositories/suggestions';
import { parseSms } from '@/domain/parser';

/** Shape handed over by `CoinflowSmsHeadlessTaskService` (Bundle → JS). */
export type SmsHeadlessPayload = {
  sender?: string | null;
  body?: string | null;
  timestampMs?: number | null;
};

/** §17.3 step 4 — `sha256(sender | amountMinor | floor(occurredAt/60000) | direction)`. */
async function dedupeKeyFor(
  sender: string,
  amountMinor: number | null,
  occurredAt: number,
  direction: string | null,
): Promise<string> {
  const minuteBucket = Math.floor(occurredAt / 60_000);
  const material = `${sender}|${amountMinor ?? ''}|${minuteBucket}|${direction ?? ''}`;
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, material, {
    encoding: Crypto.CryptoEncoding.HEX,
  });
}

export async function smsIngestTask(payload: SmsHeadlessPayload | undefined): Promise<void> {
  try {
    const sender = payload?.sender?.trim();
    if (!sender) return;

    // Step 1 — sender gate.
    if (!isKnownSender(sender)) return;

    const raw = payload?.timestampMs ?? 0;
    const receivedAt = raw > 0 ? Math.floor(raw) : Date.now();
    const body = payload?.body ?? '';

    // Step 2 — parse. Step 3 — transaction gate (folded into the parser's own ignore/transaction
    // gates, §23.1/§23.5): a non-`transaction` result means nothing is created.
    const result = parseSms({ sender, body, receivedAt });
    if (result.kind !== 'transaction') return;

    // A background trigger can fire before the UI ever ran its migrations (§17.5 / §20.4).
    await ensureMigrated();

    // Step 4 — idempotency / retry guard.
    const dedupeKey = await dedupeKeyFor(
      sender,
      result.fields.amountMinor,
      result.fields.occurredAt,
      result.fields.direction,
    );

    // Step 5 — write the Suggestion. `body` is never persisted (P-9).
    insertIfNew({
      amountMinor: result.fields.amountMinor,
      direction: result.fields.direction,
      occurredAt: result.fields.occurredAt,
      account: result.fields.account,
      normalizedKey: result.fields.normalizedKey,
      paymentMethod: result.fields.paymentMethod,
      smsSender: sender,
      smsReceivedAt: receivedAt,
      dedupeKey,
    });

    // TODO(F2/F11 — §17.3 steps 6–8): account-rule lookup, notification post (single vs. group
    // summary), self-heal for a previous run that inserted but never notified.
  } catch (e) {
    // The receiver + task must never crash the app. No PII — name only (§17.2).
    console.warn('[smsIngestTask] dropped SMS:', (e as Error)?.name ?? 'unknown');
  }
}
