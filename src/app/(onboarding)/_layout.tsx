/**
 * `(onboarding)` group — SPEC-implementation.md §28.1 / §6.1. F12. Full-screen, own back stack;
 * every screen sets its own top affordance (`OnboardingLayout`'s optional back button), so the
 * native header stays off, same convention as every other route in this app.
 */

import { Stack } from 'expo-router';

export default function OnboardingLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }} />;
}
