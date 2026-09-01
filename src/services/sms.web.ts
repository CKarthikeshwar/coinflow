/**
 * Web stub for `@/services/sms` (D3 — SMS capture is Android-only). Keeps the static web
 * build free of the native module import.
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
