/**
 * FILE PURPOSE
 * ------------
 * Sends a split's **request SMS** to each person who owes a share (SPEC-implementation.md §42.3, IMP-081,
 * SPEC-UI-UX.md §6.17 "Send flow").
 *
 * WHERE IT FITS
 * -------------
 * The split and its shares are **written first** (`persist-split.ts`); only then does this run, so a failed send
 * never loses anything — the share simply stays `Not sent` / `Sending failed` and can be resent from Details.
 * Called by the Split sheet (right after Save), the parent Confirm / Edit sheet (right after *its* Save), and the
 * Details card (Send / Retry / Resend / reminder).
 *
 * HOW IT SENDS
 * ------------
 * - one recipient at a time, in order; each result is written to the share (`requestState`, `requestSentAt`,
 *   `requestedAmountMinor`) as it arrives, so an app kill mid-way leaves an accurate record;
 * - `SEND_SMS` is asked for **just in time** (the OS prompt is the first thing the user sees when they press
 *   *Send requests*); if it is refused, **nothing is sent silently** — the recipients come back in `fallback` and
 *   the UI offers to open each message, pre-filled, in the user's own SMS app, one at a time (`openInSmsApp`);
 *   we cannot know that one was sent, so it is recorded as `opened_in_sms_app`;
 * - only shares that still owe something and have a phone number get a request; waived / settled shares don't.
 */

import { Linking } from 'react-native';

import { getSetting } from '@/db/repositories/settings';
import { setShareRequestResult, getSplit, type ShareView, type SplitView } from '@/db/repositories/splits';
import { getTransaction } from '@/db/repositories/transactions';
import { encodeRequest } from '@/domain/split-message';
import { getSendSmsPermission, requestSendSmsPermission, sendSms } from '@/services/sms';

export type SendState = 'sent' | 'failed' | 'opened_in_sms_app';
export type SendTarget = { shareId: string; personName: string; phone: string };
export type SendResult = SendTarget & { state: SendState };
export type SendReport = {
  results: SendResult[];
  /** Recipients still to be opened in the user's SMS app (SEND_SMS was refused). */
  fallback: SendTarget[];
};

/** Does this share still need a request? (never sent, failed, or the amount changed since it was sent) */
export function needsRequest(share: ShareView): boolean {
  if (!share.person.phoneDisplay) return false;
  if (share.state !== 'pending' && share.state !== 'partial') return false;
  return share.requestState === 'not_sent' || share.requestState === 'failed' || share.changedSinceRequested;
}

/** Can a request (or reminder) be sent for this share at all? */
export function canRequest(share: ShareView): boolean {
  return !!share.person.phoneDisplay && (share.state === 'pending' || share.state === 'partial');
}

/** The exact SMS text for one share (one GSM-7 segment, `encodeRequest`). */
export function requestTextFor(view: SplitView, share: ShareView, note: string | null): string {
  return encodeRequest({
    name: getSetting<string>('splitYourName', ''),
    ref: view.split.ref,
    amountMinor: share.amountMinor,
    note,
  });
}

function target(share: ShareView): SendTarget {
  return { shareId: share.id, personName: share.person.displayName, phone: share.person.phoneDisplay as string };
}

async function ensureSendPermission(): Promise<boolean> {
  const current = await getSendSmsPermission();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  return (await requestSendSmsPermission()).granted; // the just-in-time OS prompt
}

/**
 * Sends the requests for `splitId`. By default only the shares that still need one; `shareIds` + `force` resend
 * specific ones (Retry / Resend / reminder). Never throws for a send problem — outcomes are data.
 */
export async function sendRequests(
  splitId: string,
  options: { shareIds?: readonly string[]; force?: boolean } = {},
): Promise<SendReport> {
  const view = getSplit(splitId);
  if (!view) return { results: [], fallback: [] };
  const note = getTransaction(view.split.transactionId)?.note ?? null;

  const chosen = options.shareIds ? new Set(options.shareIds) : null;
  const shares = view.shares.filter((s) => {
    if (chosen && !chosen.has(s.id)) return false;
    return options.force ? canRequest(s) : needsRequest(s);
  });
  if (shares.length === 0) return { results: [], fallback: [] };

  if (!(await ensureSendPermission())) {
    return { results: [], fallback: shares.map(target) }; // nothing sent; the UI opens each in the SMS app
  }

  const results: SendResult[] = [];
  for (const share of shares) {
    const t = target(share);
    let state: SendState;
    try {
      state = await sendSms(t.phone, requestTextFor(view, share, note));
    } catch {
      state = 'failed';
    }
    setShareRequestResult(share.id, state, share.amountMinor);
    results.push({ ...t, state });
  }
  return { results, fallback: [] };
}

/**
 * Fallback: opens the request for one share, pre-filled, in the user's SMS app (they press send). One at a time —
 * the caller calls this per recipient. Recorded as `opened_in_sms_app` (we cannot know it was sent).
 */
export async function openInSmsApp(splitId: string, shareId: string): Promise<SendResult | null> {
  const view = getSplit(splitId);
  const share = view?.shares.find((s) => s.id === shareId);
  if (!view || !share || !canRequest(share)) return null;
  const note = getTransaction(view.split.transactionId)?.note ?? null;
  const t = target(share);
  try {
    await Linking.openURL(`sms:${t.phone}?body=${encodeURIComponent(requestTextFor(view, share, note))}`);
  } catch {
    setShareRequestResult(share.id, 'failed', share.amountMinor);
    return { ...t, state: 'failed' };
  }
  setShareRequestResult(share.id, 'opened_in_sms_app', share.amountMinor);
  return { ...t, state: 'opened_in_sms_app' };
}

/** `Sent to 2 people` / `1 of 2 requests failed` / `Requests ready in Messages` — for a one-line toast. */
export function summarizeReport(report: SendReport): string | null {
  const { results, fallback } = report;
  if (results.length === 0 && fallback.length === 0) return null;
  if (fallback.length > 0) return 'Couldn’t send directly — open each request in Messages from Details';
  const failed = results.filter((r) => r.state === 'failed').length;
  if (failed === 0) return results.length === 1 ? `Request sent to ${results[0].personName}` : `Requests sent to ${results.length} people`;
  if (failed === results.length) return 'Sending failed — retry from Details';
  return `${failed} of ${results.length} requests failed — retry from Details`;
}
