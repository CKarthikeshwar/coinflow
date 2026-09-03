/**
 * `OnboardingLayout` — SPEC-UI-UX.md §6.1: "Full-screen, 3-dot step progress, large heading,
 * generous spacing, one bottom-anchored primary button, Back allowed after step 1." F12. Shared
 * shell for all three onboarding screens — `onBack` omitted means no back affordance (Welcome,
 * step 1); every other step passes `router.back()`.
 */

import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';

import { Icon } from '@/ui/icon';

import { StepDots } from './step-dots';

export type OnboardingLayoutProps = {
  step: 1 | 2 | 3;
  onBack?: () => void;
  children: ReactNode;
  footer: ReactNode;
};

export function OnboardingLayout({ step, onBack, children, footer }: OnboardingLayoutProps) {
  return (
    <SafeAreaView style={styles.safe}>
      {onBack ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} style={styles.back}>
          <Icon name="arrow-left" />
        </Pressable>
      ) : (
        <View style={styles.backSpacer} />
      )}
      <View style={styles.body}>{children}</View>
      <View style={styles.footer}>
        <StepDots total={3} current={step} />
        {footer}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  back: {
    width: 44,
    height: 44,
    marginLeft: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backSpacer: { height: Spacing.six },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.five, gap: Spacing.three },
  footer: { paddingHorizontal: Spacing.five, paddingBottom: Spacing.four, gap: Spacing.three },
});
