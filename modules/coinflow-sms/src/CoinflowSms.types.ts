import type { PermissionResponse } from 'expo-modules-core';

export type { PermissionResponse };

/**
 * The native surface of `modules/coinflow-sms` (SPEC-implementation.md §17.6). Android-only —
 * on every other platform the JS layer short-circuits before touching this.
 */
export interface CoinflowSmsNativeModule {
  /** `true` on Android where the receiver + headless service are compiled in. */
  isSupported(): boolean;
  /**
   * Arms the SMS-store watcher job (CR-16). Idempotent; `false` if it could not be scheduled
   * (e.g. READ_SMS not granted yet).
   */
  armSmsStoreTrigger(): boolean;
  /** Current grant state for `RECEIVE_SMS` + `READ_SMS` (never prompts). */
  getPermissionsAsync(): Promise<PermissionResponse>;
  /** Prompt for `RECEIVE_SMS` + `READ_SMS`; resolves with the post-prompt state. */
  requestPermissionsAsync(): Promise<PermissionResponse>;
  /**
   * Read-only query against Android's shared SMS inbox for messages received at or after
   * `sinceEpochMs`, oldest first (§17.8, CR-10). Backs the reconciliation sweep that catches a
   * message another app's higher/equal-priority receiver swallowed before `SmsReceiver` ran.
   */
  getRecentInboxMessagesAsync(sinceEpochMs: number): Promise<InboxMessage[]>;
}

/** One row read from `content://sms/inbox` (§17.8). */
export interface InboxMessage {
  sender: string;
  body: string;
  timestampMs: number;
}
