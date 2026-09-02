/**
 * Notification categories — SPEC-implementation.md §31.2. Registered at module scope (imported
 * from the app entry alongside the task definitions, §17.2) so they exist in a headless context.
 *
 * Spec names these `txn-known` / `txn-new`, but `expo-notifications`' own
 * `setNotificationCategoryAsync` docs warn against `:` or `-` in a category identifier
 * ("categories might not work as expected") — confirmed against the installed
 * `expo-notifications@57.0.16` typings. Using hyphen-free ids here is a pure identifier-string
 * change with no effect on the spec'd behavior (content/buttons/routing are unaffected).
 */

import * as Notifications from 'expo-notifications';

export const TXN_KNOWN_CATEGORY = 'txnKnown';
export const TXN_NEW_CATEGORY = 'txnNew';

const SAVE_ACTION: Notifications.NotificationAction = {
  identifier: 'SAVE',
  buttonTitle: 'Save',
  options: { opensAppToForeground: false },
};

const ADD_ACTION: Notifications.NotificationAction = {
  identifier: 'ADD',
  buttonTitle: 'Add',
  options: { opensAppToForeground: true },
};

const DISCARD_ACTION: Notifications.NotificationAction = {
  identifier: 'DISCARD',
  buttonTitle: 'Discard',
  options: { opensAppToForeground: false, isDestructive: true },
};

export async function registerNotificationCategories(): Promise<void> {
  // Known account (a rule with a category) — Save · Add · Discard.
  await Notifications.setNotificationCategoryAsync(TXN_KNOWN_CATEGORY, [
    SAVE_ACTION,
    ADD_ACTION,
    DISCARD_ACTION,
  ]);
  // New account (no rule, or a rule with no category yet) — Add · Discard only (§31.2).
  await Notifications.setNotificationCategoryAsync(TXN_NEW_CATEGORY, [ADD_ACTION, DISCARD_ACTION]);
}
