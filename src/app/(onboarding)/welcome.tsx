/**
 * FILE PURPOSE
 * ------------
 * The first screen of onboarding — a static welcome message with a "Get started" button. No
 * database reads here. Shown automatically on first launch (before `onboardingDone` is set) by
 * `src/features/app-shell/root-navigator.tsx`'s `Stack.Protected` guard, which makes the whole
 * `(onboarding)` route group the only thing reachable until onboarding finishes.
 */

import { router } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';

import { useOnboarding } from '@/stores';

import { OnboardingGraphic } from '@/features/onboarding/onboarding-graphic';
import { OnboardingLayout } from '@/features/onboarding/onboarding-layout';
import { Button } from '@/ui/button';
import { ThemedText } from '@/ui/themed-text';

export default function WelcomeScreen() {
  const goTo = useOnboarding((s) => s.goTo);

  useEffect(() => {
    goTo(1);
  }, [goTo]);

  return (
    <OnboardingLayout step={1} footer={<Button onPress={() => router.push('/permissions')}>Get started</Button>}>
      <OnboardingGraphic variant="welcome" />
      <ThemedText type="title" style={styles.heading}>
        CoinFlow
      </ThemedText>
      <ThemedText type="body" themeColor="text2" style={styles.line}>
        Detects your bank &amp; UPI transactions automatically — no manual logging.
      </ThemedText>
      <ThemedText type="caption" themeColor="text3" style={styles.line}>
        Everything stays on this device.
      </ThemedText>
    </OnboardingLayout>
  );
}

const styles = StyleSheet.create({
  heading: { textAlign: 'center' },
  line: { textAlign: 'center' },
});
