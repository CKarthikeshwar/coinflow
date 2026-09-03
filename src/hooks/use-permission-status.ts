/**
 * Live SMS + notification permission status (SPEC-implementation.md §22.4) — read from the OS,
 * never stored, re-checked on `AppState → active`. Shared by every screen that shows a
 * `PermissionBanner` or a permission card (Home first, §30.4; Review Queue / onboarding /
 * Settings › SMS & notifications reuse it as they're built).
 *
 * `smsCanAskAgain`/`notificationsCanAskAgain` (F8.5) carry the OS's own distinction between
 * "denied, asking again shows the normal prompt" and "permanently denied, asking again silently
 * no-ops" — IMP-042 needs it to decide whether a permission card's action re-requests or opens
 * the system settings screen instead. Home/Review Queue's simpler banners don't need this (they
 * only ever re-request), so it's additive — existing `.sms`/`.notifications` consumers unaffected.
 */

import * as Notifications from 'expo-notifications';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { getSmsPermissions } from '@/services/sms';

export type PermissionStatus = 'unknown' | 'granted' | 'denied';

export function usePermissionStatus() {
  const [sms, setSms] = useState<PermissionStatus>('unknown');
  const [smsCanAskAgain, setSmsCanAskAgain] = useState(true);
  const [notifications, setNotifications] = useState<PermissionStatus>('unknown');
  const [notificationsCanAskAgain, setNotificationsCanAskAgain] = useState(true);

  const check = useCallback(async () => {
    const [smsRes, notifRes] = await Promise.all([getSmsPermissions(), Notifications.getPermissionsAsync()]);
    setSms(smsRes.granted ? 'granted' : 'denied');
    setSmsCanAskAgain(smsRes.canAskAgain);
    setNotifications(notifRes.granted ? 'granted' : 'denied');
    setNotificationsCanAskAgain(notifRes.canAskAgain);
  }, []);

  useEffect(() => {
    // Initial check on mount, then re-checked live on foreground (§22.4) via the AppState
    // subscription below — permission status is never stored. `check` awaits before setting
    // state, so this isn't the synchronous-cascading-render shape the rule guards against;
    // there's no simpler subscription source for "current OS permission state" (same pattern
    // already established in `review-queue.tsx`'s own inline version of this check).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    check();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => sub.remove();
  }, [check]);

  return { sms, smsCanAskAgain, notifications, notificationsCanAskAgain, refresh: check };
}
