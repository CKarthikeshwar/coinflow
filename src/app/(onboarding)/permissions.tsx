/**
 * Onboarding — Permissions — SPEC-UI-UX.md §6.1, SPEC-implementation.md §30.2 (IMP-040/041/042).
 * F12. Live OS permission status via `usePermissionStatus`; two `PermissionCard`s. Same
 * canAskAgain-branching pattern `sms-notifications.tsx` (F8.5) established — this is that
 * component's second intended consumer, not a new mechanism.
 *
 * "Continue" is always enabled (no permission is mandatory, §11); "Skip for now" does the exact
 * same thing with lighter-weight copy for someone who doesn't want to engage with the cards at
 * all (§6.1's own wording lists both as distinct affordances on this screen).
 *
 * Simplification (documented, not silent): skips the per-step abstract graphic §6.1's opening
 * line calls for on every screen — two full `PermissionCard`s plus heading/Continue/Skip already
 * fill a screen with no scroll container here; adding a graphic risks overflow on shorter
 * devices for no real gain on the one step that's already content-dense.
 */

import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { Linking, Pressable, StyleSheet } from 'react-native';

import { usePermissionStatus } from '@/hooks/use-permission-status';
import { requestSmsPermissions } from '@/services/sms';
import { useOnboarding } from '@/stores';

import { OnboardingLayout } from '@/features/onboarding/onboarding-layout';
import { PermissionCard } from '@/features/onboarding/permission-card';
import { Button } from '@/ui/button';
import { ThemedText } from '@/ui/themed-text';

export default function PermissionsScreen() {
  const goTo = useOnboarding((s) => s.goTo);
  const permission = usePermissionStatus();

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

  const proceed = () => router.push('/category-review');

  return (
    <OnboardingLayout
      step={2}
      onBack={() => router.back()}
      footer={
        <>
          <Button onPress={proceed}>Continue</Button>
          <Pressable accessibilityRole="button" onPress={proceed} style={styles.skip}>
            <ThemedText type="label" themeColor="text2">
              Skip for now
            </ThemedText>
          </Pressable>
        </>
      }
    >
      <ThemedText type="title" style={styles.heading}>
        Two quick permissions
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
    </OnboardingLayout>
  );
}

const styles = StyleSheet.create({
  heading: { textAlign: 'center' },
  skip: { alignItems: 'center', minHeight: 44, justifyContent: 'center' },
});
