import type { PermissionResponse } from 'expo-modules-core';

export type { PermissionResponse };

/**
 * The native surface of `modules/coinflow-sms` (SPEC-implementation.md §17.6). Android-only —
 * on every other platform the JS layer short-circuits before touching this.
 */
export interface CoinflowSmsNativeModule {
  /** `true` on Android where the receiver + headless service are compiled in. */
  isSupported(): boolean;
  /** Current grant state for `RECEIVE_SMS` + `READ_SMS` (never prompts). */
  getPermissionsAsync(): Promise<PermissionResponse>;
  /** Prompt for `RECEIVE_SMS` + `READ_SMS`; resolves with the post-prompt state. */
  requestPermissionsAsync(): Promise<PermissionResponse>;
}
