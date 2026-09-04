/**
 * Onboarding — Permissions — SPEC-UI-UX.md §6.1, SPEC-implementation.md §30.2 (IMP-040/041/042).
 * F12. Live OS permission status via `usePermissionStatus`; three `PermissionCard`s (SMS,
 * notifications, crash reporting). Same canAskAgain-branching pattern `sms-notifications.tsx`
 * (F8.5) established — this is that component's second intended consumer, not a new mechanism.
 *
 * The crash-reporting card (2026-09-04, D34 deviation) is app-level, not an OS permission — no
 * dialog, no denied/permanently-denied state, `onRequest` just flips `crashReportingEnabled` and
 * arms Sentry immediately (`src/services/crash`). D34 originally specced "no onboarding step"
 * for crash reporting *because* it defaults off and nothing transmits either way — surfacing it
 * here doesn't violate that guarantee, it's still off unless tapped, just asked for up front
 * rather than only from Settings › Data.
 *
 * "Continue" is always enabled (no permission is mandatory, §11) — but unlike "Skip for now" (which
 * always just navigates), Continue first fires the OS request dialog for whichever permission(s)
 * are still askable (not yet decided, or denied-but-not-permanently), same as tapping a card's own
 * Allow button would. User-reported bug (2026-09-04): Continue used to behave identically to Skip,
 * silently never prompting — someone who never touches the individual cards (the expected common
 * path, not an edge case) would sail through onboarding with SMS detection never actually granted,
 * discovering it later as "nothing's being detected" with no clear cause. A permanently-denied
 * permission is left alone here — Continue never opens system settings on its own; that's still
 * the card's own explicit action. Continue does not auto-enable crash reporting — that stays an
 * explicit tap on its own card, same as every other opt-in in this app.
 *
 * Simplification (documented, not silent): skips the per-step abstract graphic §6.1's opening
 * line calls for on every screen — three full `PermissionCard`s plus heading/Continue/Skip
 * already fill a screen with no scroll container here; adding a graphic risks overflow on
 * shorter devices for no real gain on the one step that's already content-dense.
 */

import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { Linking, Pressable, StyleSheet } from 'react-native';

import { setSetting, useSetting } from '@/db/repositories/settings';
import { usePermissionStatus } from '@/hooks/use-permission-status';
import { armCrashReporting } from '@/services/crash';
import { requestSmsPermissions } from '@/services/sms';
import { useOnboarding } from '@/stores';

import { OnboardingLayout } from '@/features/onboarding/onboarding-layout';
import { PermissionCard } from '@/features/onboarding/permission-card';
import { Button } from '@/ui/button';
import { ThemedText } from '@/ui/themed-text';

export default function PermissionsScreen() {
  const goTo = useOnboarding((s) => s.goTo);
  const permission = usePermissionStatus();
  const crashReporting = useSetting<boolean>('crashReportingEnabled');
  const crashReportingOn = crashReporting.value ?? false;

  const handleCrashReportingRequest = () => {
    setSetting('crashReportingEnabled', true);
    armCrashReporting(true);
  };

  useEffect(() => {
    goTo(2);
  }, [goTo]);

  const handleSmsRequest = async () => {
    if (permission.smsCanAskAgain) {
      await requestSmsPermissions();
      permission.refresh();
    } else {
      await Linking.openSettings();
    }
  };

  const handleNotifRequest = async () => {
    if (permission.notificationsCanAskAgain) {
      await Notifications.requestPermissionsAsync();
      permission.refresh();
    } else {
      await Linking.openSettings();
    }
  };

  const continueAndRequest = async () => {
    if (permission.sms !== 'granted' && permission.smsCanAskAgain) {
      await requestSmsPermissions();
    }
    if (permission.notifications !== 'granted' && permission.notificationsCanAskAgain) {
      await Notifications.requestPermissionsAsync();
    }
    permission.refresh();
    router.push('/category-review');
  };

  const skip = () => router.push('/category-review');

  return (
    <OnboardingLayout
      step={2}
      onBack={() => router.back()}
      footer={
        <>
          <Button onPress={continueAndRequest}>Continue</Button>
          <Pressable accessibilityRole="button" onPress={skip} style={styles.skip}>
            <ThemedText type="label" themeColor="text2">
              Skip for now
            </ThemedText>
          </Pressable>
        </>
      }
    >
      <ThemedText type="title" style={styles.heading}>
        A few quick things
      </ThemedText>
      <PermissionCard
        kind="sms"
        state={permission.sms === 'unknown' ? 'idle' : permission.sms}
        canAskAgain={permission.smsCanAskAgain}
        onRequest={handleSmsRequest}
      />
      <PermissionCard
        kind="notif"
        state={permission.notifications === 'unknown' ? 'idle' : permission.notifications}
        optional
        canAskAgain={permission.notificationsCanAskAgain}
        onRequest={handleNotifRequest}
      />
      <PermissionCard
        kind="crash"
        state={crashReportingOn ? 'granted' : 'idle'}
        optional
        onRequest={handleCrashReportingRequest}
      />
    </OnboardingLayout>
  );
}

const styles = StyleSheet.create({
  heading: { textAlign: 'center' },
  skip: { alignItems: 'center', minHeight: 44, justifyContent: 'center' },
});
