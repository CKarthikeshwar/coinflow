/**
 * `SMS_INGEST_TASK` body (SPEC-implementation.md §17.3, steps 1–8 — F1 + F2 scope).
 *
 * Contract that holds throughout: runs with no UI, opens `expo-sqlite` itself, never logs the
 * body / amount / account, and never throws out of `smsIngestTask` (§17.2 / §32 E1/E2).
 */

import * as Crypto from 'expo-crypto';

import { isKnownSender } from '@/constants/sms-senders';
import { getAccountRule } from '@/db/repositories/account-rules';
import { getSuggestion, insertIfNew } from '@/db/repositories/suggestions';
import { hasDedupeKey } from '@/db/repositories/transactions';
import { ensureMigrated } from '@/db/maintenance';
import { parseSms } from '@/domain/parser';
import { postForSuggestion } from '@/services/notifications/post';
import { reconcileNotifications } from '@/services/notifications/reconcile';

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

    // Step 4 — idempotency / retry guard. Checks both tables: a `Suggestion` may already have
    // been purged (D26, ~24h after confirm) while its `Transaction` still carries the key.
    const dedupeKey = await dedupeKeyFor(
      sender,
      result.fields.amountMinor,
      result.fields.occurredAt,
      result.fields.direction,
    );
    if (hasDedupeKey(dedupeKey)) return;

    // Step 5 — write the Suggestion. `body` is never persisted (P-9).
    const { created, id } = insertIfNew({
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
    if (!created) return; // a retry of an already-recorded suggestion — already notified once

    // Step 6 — account-rule lookup.
    const suggestion = getSuggestion(id);
    if (!suggestion) return; // extremely unlikely (row just inserted); never throw regardless

    const rule = suggestion.normalizedKey ? getAccountRule(suggestion.normalizedKey) : null;

    // Step 7 — notify (single vs. group decision lives in post.ts).
    await postForSuggestion(suggestion, rule);

    // Step 8 — self-heal: re-post for any older pending Suggestion missing a live notification
    // (a previous run inserted the row but was killed before step 7). Idempotent — safe to call
    // unconditionally every time.
    await reconcileNotifications();
  } catch (e) {
    // The receiver + task must never crash the app. No PII — name only (§17.2).
    console.warn('[smsIngestTask] dropped SMS:', (e as Error)?.name ?? 'unknown');
  }
}
