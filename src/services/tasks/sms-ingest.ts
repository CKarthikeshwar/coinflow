/**
 * FILE PURPOSE
 * ------------
 * This is the actual function that runs every time an SMS arrives on the device — from "here's
 * the raw text of a message" all the way to "a notification is on screen asking the user to
 * confirm a detected transaction." It's the single most important function in the automatic-
 * detection feature: everything else (the parser, the repositories, the notification service)
 * exists to be called from here.
 *
 * WHERE IT FITS
 * -------------
 * Registered as the handler for the `'CoinflowSmsIngest'` headless task in
 * `src/services/tasks/index.ts` — see that file for how Android wakes up the JS engine to run
 * this function even when the app isn't open. This function has NO UI: it can't show a screen,
 * can't rely on any React state, and has to open its own database connection (well, `db/client.ts`
 * does that automatically on import) since there's no app already running to share one with.
 *
 * THE 8-STEP PIPELINE
 * --------------------
 *   1. Sender gate      — bail out immediately if the SMS isn't from a known bank/payment sender.
 *   2. Parse             — hand the message to `parseSms()` (`src/domain/parser/`).
 *   3. Transaction gate  — a non-transaction parse result (ignored SMS) means stop here.
 *   4. Dedupe check      — has an identical transaction already been recorded? (guards against
 *                          the same SMS triggering this task twice, e.g. on a retry.)
 *   5. Write Suggestion  — save a `suggestions` row via `insertIfNew` (`db/repositories/suggestions.ts`).
 *   6. Account lookup    — check `accountRules` to see if this account is "known" (has a learned
 *                          category) or "new" — this affects what the notification looks like.
 *   7. Notify             — post a local notification for the user to review/confirm.
 *   8. Self-heal          — re-check for any older suggestion that got saved but never got its
 *                          notification posted (e.g. the task was killed mid-way on a previous
 *                          run), and post for those too.
 *
 * IMPORTANT
 * ---------
 * - This function must NEVER throw. Every step is wrapped in one big try/catch, and a caught
 *   error is only logged (by error *type name*, e.g. "TypeError" — never the actual message,
 *   which could leak SMS content into logs) and swallowed. Android can — and does — run this
 *   task under tight resource constraints; a crash here could affect the OS's willingness to
 *   wake the app for future SMS, so "drop this one SMS silently" is far safer than crashing.
 * - The raw SMS body is NEVER written to the database or logged anywhere — only the parsed,
 *   structured fields (amount, direction, account) are stored. This is a deliberate privacy
 *   choice that holds throughout the app, not just here.
 * - `ensureMigrated()` is called before any database write because this task can genuinely be
 *   the very first code that runs after installing the app, if a background SMS somehow arrives
 *   before the user has ever opened it once (rare, but the code has to handle it).
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
