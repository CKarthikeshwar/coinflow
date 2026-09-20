/**
 * FILE PURPOSE
 * ------------
 * The JavaScript side of this custom native module — a thin wrapper around the Kotlin code in
 * `modules/coinflow-sms/android/` (`CoinflowSmsModule.kt`). This is where the native/JS boundary
 * actually is: everything below this file is Kotlin, everything above it (starting with
 * `src/services/sms.ts`, the only file in `src/` allowed to import from here) is plain
 * TypeScript.
 *
 * The Kotlin side does **only** the wake trigger: a manifest `<receiver>` for `SMS_RECEIVED`
 * that coalesces the PDUs and starts a bounded headless-JS task. No parsing, no SQLite, no
 * notifications happen in native code (§17). Android-only (D3): on iOS / web every export
 * throws `UnavailabilityError` or returns a safe default.
 */

import { requireOptionalNativeModule } from 'expo';
import { UnavailabilityError } from 'expo-modules-core';
import { Platform } from 'react-native';

import type { CoinflowSmsNativeModule, InboxMessage, PermissionResponse, SendSmsResult } from './CoinflowSms.types';

export type { InboxMessage, PermissionResponse, SendSmsResult } from './CoinflowSms.types';

const NAME = 'CoinflowSms';

const native =
  Platform.OS === 'android'
    ? requireOptionalNativeModule<CoinflowSmsNativeModule>(NAME)
    : null;

/** `true` only on Android with the native module linked in a dev-client / standalone build. */
export function isSupported(): boolean {
  return native?.isSupported() ?? false;
}

/** Read the current `RECEIVE_SMS` + `READ_SMS` grant state without prompting. */
export async function getPermissionsAsync(): Promise<PermissionResponse> {
  if (!native) throw new UnavailabilityError(NAME, 'getPermissionsAsync');
  return native.getPermissionsAsync();
}

/** Prompt for `RECEIVE_SMS` + `READ_SMS`. Resolves with the state after the prompt. */
export async function requestPermissionsAsync(): Promise<PermissionResponse> {
  if (!native) throw new UnavailabilityError(NAME, 'requestPermissionsAsync');
  return native.requestPermissionsAsync();
}

/** Messages in `content://sms/inbox` received at or after `sinceEpochMs`, oldest first (§17.8). */
export async function getRecentInboxMessagesAsync(sinceEpochMs: number): Promise<InboxMessage[]> {
  if (!native) throw new UnavailabilityError(NAME, 'getRecentInboxMessagesAsync');
  return native.getRecentInboxMessagesAsync(sinceEpochMs);
}

/**
 * Arms the SMS-store watcher (a JobScheduler job triggered by changes to `content://sms`, CR-16).
 * Idempotent and cheap — an already-pending job is left alone. Resolves to whether a job is now
 * scheduled; `false` before READ_SMS is granted or off-Android.
 */
export function armSmsStoreTrigger(): boolean {
  return native?.armSmsStoreTrigger() ?? false;
}

/** Read the current `SEND_SMS` grant state without prompting. */
export async function getSendSmsPermissionAsync(): Promise<PermissionResponse> {
  if (!native) throw new UnavailabilityError(NAME, 'getSendSmsPermissionAsync');
  return native.getSendSmsPermissionAsync();
}

/** Prompt for `SEND_SMS` (just-in-time, only when the user sends a split request). */
export async function requestSendSmsPermissionAsync(): Promise<PermissionResponse> {
  if (!native) throw new UnavailabilityError(NAME, 'requestSendSmsPermissionAsync');
  return native.requestSendSmsPermissionAsync();
}

/** Sends one SMS on the default SMS SIM; resolves 'sent' or 'failed' (never rejects, 30 s timeout — §42.3). */
export async function sendSmsAsync(phone: string, text: string): Promise<SendSmsResult> {
  if (!native) return 'failed';
  return native.sendSmsAsync(phone, text);
}

/** Hands the widget snapshot JSON to the native widget providers (§44.3); false when unavailable. */
export function publishWidgetSnapshot(json: string): boolean {
  return native?.publishWidgetSnapshot(json) ?? false;
}
