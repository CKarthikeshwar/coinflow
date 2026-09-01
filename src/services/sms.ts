/**
 * App-facing wrapper over `modules/coinflow-sms` (SPEC-implementation.md §17.6 / §18.1).
 * Features import this, never the module directly. Android-only; every call is guarded so
 * the rest of the app (manual mode) works unchanged when SMS capture is unavailable.
 */

import { PermissionStatus } from 'expo-modules-core';

import * as CoinflowSms from '../../modules/coinflow-sms';
import type { PermissionResponse } from '../../modules/coinflow-sms';

export type { PermissionResponse };

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

function deniedResponse(): PermissionResponse {
  return {
    status: PermissionStatus.DENIED,
    granted: false,
    canAskAgain: false,
    expires: 'never',
  };
}
