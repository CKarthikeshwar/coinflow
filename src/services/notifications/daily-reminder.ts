/**
 * FILE PURPOSE
 * ------------
 * Schedules the once-a-day reminder ("Have you recorded all of today's transactions?") that fires
 * around 9:30 AM local time.
 *
 * WHERE IT FITS
 * -------------
 * `src/services/tasks/index.ts` calls `ensureDailyReminder` on every JS start. It uses a fixed
 * notification identifier and a native DAILY trigger, so re-scheduling replaces the existing
 * entry rather than duplicating it, and Android's alarm keeps repeating without the app running.
 * Tapping it just opens the app (`deep-link.ts` maps an unknown `kind` to home).
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { DAILY_REMINDER_CHANNEL_ID } from './channel';

export const DAILY_REMINDER_IDENTIFIER = 'daily-reminder';
export const DAILY_REMINDER_HOUR = 9;
export const DAILY_REMINDER_MINUTE = 30;

export async function ensureDailyReminder(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const permission = await Notifications.getPermissionsAsync();
  if (permission.status !== 'granted') return; // silent, same as the other notifications

  await Notifications.scheduleNotificationAsync({
    identifier: DAILY_REMINDER_IDENTIFIER,
    content: {
      title: 'Recorded everything today?',
      body: "Take a moment to add any transactions you haven't logged yet.",
      data: { kind: 'daily-reminder' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: DAILY_REMINDER_HOUR,
      minute: DAILY_REMINDER_MINUTE,
      channelId: DAILY_REMINDER_CHANNEL_ID,
    },
  });
}
