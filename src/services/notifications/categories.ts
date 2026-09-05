/**
 * FILE PURPOSE
 * ------------
 * Defines the two possible *sets of action buttons* a transaction-review notification can show,
 * and registers them with Android so the OS knows what "Save"/"Add"/"Discard" mean and how each
 * button should behave (e.g. whether tapping it should open the app).
 *
 * WHERE IT FITS
 * -------------
 * `src/services/notifications/content.ts` picks which of these two categories a given
 * notification uses (`TXN_KNOWN_CATEGORY` for an account the app already has a learned category
 * for, `TXN_NEW_CATEGORY` for one it doesn't) when it builds the notification. Registration
 * happens once, from `src/services/tasks/index.ts` at app-entry time — before either the UI or
 * a background task could ever need to post a notification using them.
 *
 * THE TWO CATEGORIES
 * -------------------
 * - "Known" account (there's a learned rule with a category already) → Save · Add · Discard.
 *   "Save" can one-tap-confirm the transaction using the learned category, without opening the app.
 * - "New" account (no rule yet, or a rule with no category) → Add · Discard only. There's no
 *   "Save" option here because there's no category to save it with — the user has to open the
 *   app ("Add") to pick one.
 *
 * IMPORTANT
 * ---------
 * The category id strings here (`'txnKnown'`, `'txnNew'`) are camelCase, not the hyphenated
 * `txn-known`/`txn-new` you might expect from the naming convention elsewhere in this app —
 * that's deliberate: `expo-notifications`' own docs warn that `:` or `-` in a category
 * identifier can make categories misbehave on Android. This is purely an identifier-string
 * choice; it doesn't change what each category does or looks like.
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
