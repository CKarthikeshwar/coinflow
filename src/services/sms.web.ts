/**
 * Web build's replacement for `sms.ts`. Returns "not supported / permission denied" for
 * everything, without importing the native `modules/coinflow-sms` module at all — since that
 * module is Kotlin/Android-only, importing it in the web bundle would break the web build.
 * Callers don't need to special-case web themselves: they call the same functions either way,
 * and just get back "no SMS capture available here," which naturally routes the UI into manual
 * entry mode.
 */

import { PermissionStatus } from 'expo-modules-core';

import type { PermissionResponse } from '../../modules/coinflow-sms';

export type { PermissionResponse };

export function isSmsCaptureSupported(): boolean {
  return false;
}

export async function getSmsPermissions(): Promise<PermissionResponse> {
  return deniedResponse();
}

export async function requestSmsPermissions(): Promise<PermissionResponse> {
  return deniedResponse();
}

function deniedResponse(): PermissionResponse {
  return {
    status: PermissionStatus.DENIED,
    granted: false,
    canAskAgain: false,
    expires: 'never',
  };
}
