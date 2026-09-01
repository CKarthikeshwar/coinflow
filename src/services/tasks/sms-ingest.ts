/**
 * `SMS_INGEST_TASK` body (SPEC-implementation.md §17.3).
 *
 * STEP 4 SCOPE — skeleton only. The full pipeline (sender gate §17.3.1, domain parser §23,
 * transaction gate §17.3.3, rule match §17.3.6, notification post §17.3.7, self-heal
 * §17.3.8) lands in step 5. For now this proves the wake → headless-JS → SQLite path:
 * every delivered SMS is recorded as one bare `pending` Suggestion, guarded by a retry key.
 *
 * Contract that already holds: runs with no UI, opens `expo-sqlite` itself, never logs the
 * body / amount / account, and never throws out of `smsIngestTask` (§17.2 / §32 E1/E2).
 */

import * as Crypto from 'expo-crypto';

import { ensureMigrated } from '@/db/maintenance';
import { insertIfNew } from '@/db/repositories/suggestions';

/** Shape handed over by `CoinflowSmsHeadlessTaskService` (Bundle → JS). */
export type SmsHeadlessPayload = {
  sender?: string | null;
  body?: string | null;
  timestampMs?: number | null;
};

/**
 * §17.3 step 4 — `dedupeKey = sha256(sender | amountMinor | floor(occurredAt/60000) | direction)`.
 * Step 4 has no parsed amount/direction yet, so the key is built from what the receiver gives
 * us. It is recomputed with the full field set once the parser lands (step 5), so a step-4
 * row and its step-5 successor can legitimately differ — acceptable for the skeleton.
 */
async function dedupeKeyFor(sender: string, receivedAt: number): Promise<string> {
  const minuteBucket = Math.floor(receivedAt / 60_000);
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${sender}|${minuteBucket}`,
    { encoding: Crypto.CryptoEncoding.HEX },
  );
}

export async function smsIngestTask(payload: SmsHeadlessPayload | undefined): Promise<void> {
  try {
    const sender = payload?.sender?.trim();
    if (!sender) return;

    const raw = payload?.timestampMs ?? 0;
    const receivedAt = raw > 0 ? Math.floor(raw) : Date.now();

    // A background trigger can fire before the UI ever ran its migrations (§17.5 / §20.4).
    await ensureMigrated();

    const dedupeKey = await dedupeKeyFor(sender, receivedAt);
    insertIfNew({ smsSender: sender, smsReceivedAt: receivedAt, dedupeKey });
  } catch (e) {
    // The receiver + task must never crash the app. No PII — name only (§17.2).
    console.warn('[smsIngestTask] dropped SMS:', (e as Error)?.name ?? 'unknown');
  }
}
