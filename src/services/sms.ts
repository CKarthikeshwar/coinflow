/**
 * FILE PURPOSE
 * ------------
 * A thin, safe wrapper around the custom native module `modules/coinflow-sms/` (the Kotlin code
 * that actually receives SMS on Android). This file is the ONLY place in `src/` that's allowed
 * to import that native module directly — everything else goes through here instead.
 *
 * WHERE IT FITS
 * -------------
 * Used by anything that needs to know or change SMS-permission state:
 * `src/hooks/use-permission-status.ts` (the shared hook that tracks permission state app-wide),
 * `src/app/(onboarding)/permissions.tsx` (the onboarding permission-request screen),
 * `src/app/(tabs)/index.tsx` and `src/app/sms-notifications.tsx`/`review-queue.tsx` (banners
 * prompting the user to enable SMS capture if it's off).
 *
 * IMPORTANT
 * ---------
 * - This app works in two modes: fully automatic (SMS permission granted — transactions are
 *   detected from bank messages) or fully manual (permission denied/unsupported — the user
 *   types every transaction in themselves). Every function here is written so that when SMS
 *   capture isn't available, it degrades gracefully to a "denied" response instead of throwing
 *   — the rest of the app's manual-entry flow keeps working unchanged either way.
 * - `isSmsCaptureSupported()` only returns `true` on a real Android dev-client/standalone build
 *   with the native module actually linked — it's `false` on Expo Go (which can't run this
 *   app's SMS pipeline at all — see CLAUDE.md) and on web.
 * - This file has a `.web.ts` sibling (`sms.web.ts`) that never imports the native module at
 *   all — that's what keeps the web build (which has no SMS capability) free of native code it
 *   could never actually run.
 */

import { PermissionStatus } from 'expo-modules-core';

import * as CoinflowSms from '../../modules/coinflow-sms';
import type { InboxMessage, PermissionResponse, SendSmsResult } from '../../modules/coinflow-sms';

export type { InboxMessage, PermissionResponse, SendSmsResult };

/** `true` only on an Android dev-client / standalone build with the native module linked. */
export function isSmsCaptureSupported(): boolean {
  return CoinflowSms.isSupported();
}

/** Grant state for `RECEIVE_SMS` + `READ_SMS`, or a synthetic denied response off-Android. */
export async function getSmsPermissions(): Promise<PermissionResponse> {
  if (!CoinflowSms.isSupported()) return deniedResponse();
  return CoinflowSms.getPermissionsAsync();
}

/** Prompt for `RECEIVE_SMS` + `READ_SMS`; no-op (denied) where capture is unsupported. */
export async function requestSmsPermissions(): Promise<PermissionResponse> {
  if (!CoinflowSms.isSupported()) return deniedResponse();
  return CoinflowSms.requestPermissionsAsync();
}

/** Inbox messages at/after `sinceEpochMs` (§17.8); `[]` where capture is unsupported. */
/** Arms the SMS-store watcher (CR-16). Safe to call often — an already-armed trigger is left alone. */
export function armSmsStoreTrigger(): boolean {
  if (!CoinflowSms.isSupported()) return false;
  return CoinflowSms.armSmsStoreTrigger();
}

export async function getRecentSmsMessages(sinceEpochMs: number): Promise<InboxMessage[]> {
  if (!CoinflowSms.isSupported()) return [];
  return CoinflowSms.getRecentInboxMessagesAsync(sinceEpochMs);
}

/** Grant state for `SEND_SMS` (never prompts); denied where sending is unsupported. */
export async function getSendSmsPermission(): Promise<PermissionResponse> {
  if (!CoinflowSms.isSupported()) return deniedResponse();
  return CoinflowSms.getSendSmsPermissionAsync();
}

/** Prompt for `SEND_SMS` — just-in-time, only when the user sends a split request (IMP-098). */
export async function requestSendSmsPermission(): Promise<PermissionResponse> {
  if (!CoinflowSms.isSupported()) return deniedResponse();
  return CoinflowSms.requestSendSmsPermissionAsync();
}

/** Sends one SMS on the default SMS SIM (§42.3); 'failed' where unsupported. Never rejects. */
export async function sendSms(phone: string, text: string): Promise<SendSmsResult> {
  if (!CoinflowSms.isSupported()) return 'failed';
  try {
    return await CoinflowSms.sendSmsAsync(phone, text);
  } catch {
    return 'failed';
  }
}

/** Pushes the widget snapshot to the native widgets (§44.3); false where unsupported. Never throws. */
export function publishWidgetSnapshotJson(json: string): boolean {
  if (!CoinflowSms.isSupported()) return false;
  try {
    return CoinflowSms.publishWidgetSnapshot(json);
  } catch {
    return false;
  }
}

function deniedResponse(): PermissionResponse {
  return {
    status: PermissionStatus.DENIED,
    granted: false,
    canAskAgain: false,
    expires: 'never',
  };
}
