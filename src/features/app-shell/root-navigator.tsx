/**
 * `RootNavigator` — SPEC-implementation.md §28.1 (F12). First launch (no `onboardingDone` row
 * yet, or explicitly `false`) shows only `(onboarding)`; later launches — and the moment
 * `(onboarding)/category-review.tsx`'s Done handler writes the setting — show the normal app
 * (UI-062). Read live via `useSetting`, not a one-time snapshot, so the gate flips the instant
 * that write happens (that screen also does an explicit `router.replace('/')` itself, §30.3, so
 * this is the robustness path, not the only way the transition happens).
 *
 * Uses `<Stack.Protected guard={...}>` (SDK 57), **not** a conditional `<Redirect>` swapped in
 * for the `<Stack>` itself. An earlier version of this file did exactly that — return either
 * `<Redirect href="/welcome" />` *or* `<Stack />`, never both — which sounds equivalent but
 * isn't: while the `<Redirect>` branch is active, **no navigator is mounted at all**, since the
 * `<Stack>` that would normally host it doesn't exist yet. `<Redirect>` has nothing to attach
 * to, and the resulting reconciliation churn showed up on-device as a persistent flicker,
 * reported 2026-09-03. `Stack.Protected` is expo-router's actual answer to this: the `<Stack>`
 * stays mounted continuously, and each guard only adds/removes *screens* from it, which is a
 * stable, supported operation, not a full navigator teardown/remount.
 *
 * Only safe to mount inside `<MigrationGate>` — this hook needs migrations to have already run
 * (same class of hazard already hit once this project: F9's `analytics-period` store, which is
 * why that one *doesn't* read settings at its own creation time). Never rendered on web —
 * `src/app/_layout.web.tsx` is a separate, simpler file precisely to keep this live query off
 * web entirely (see its own header for why).
 *
 * Lives here, not inlined in `src/app/_layout.tsx`, purely so it can be unit tested without
 * mocking that file's entire provider tree (`MigrationGate` alone pulls in a real
 * `SQLite.openDatabaseSync` call at module load) — same reasoning `SheetHost`/`NotificationRouter`
 * already live in this folder for.
 */

import { Stack } from 'expo-router';

import { useSetting } from '@/db/repositories/settings';

export function RootNavigator() {
  const onboardingDone = useSetting<boolean>('onboardingDone');
  // Still resolving (first ever query on a cold DB) — render nothing; the splash overlay
  // already covers this same window for `fontsLoaded`/`<MigrationGate>`, so this isn't a new
  // visible gap. Once resolved, `onboardingDone.value` only ever reads `true` or not-`true`
  // from here on (never goes back to "resolving").
  if (onboardingDone.updatedAt === undefined) return null;

  const isOnboarded = onboardingDone.value === true;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: 'transparent' },
      }}
    >
      <Stack.Protected guard={!isOnboarded}>
        <Stack.Screen name="(onboarding)" />
      </Stack.Protected>
      <Stack.Protected guard={isOnboarded}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="review-queue" />
        <Stack.Screen name="transaction/[id]" />
        <Stack.Screen name="categories" />
        <Stack.Screen name="account-rules" />
        <Stack.Screen name="payment-methods" />
        <Stack.Screen name="sms-notifications" />
        <Stack.Screen name="data" />
        <Stack.Screen name="about" />
      </Stack.Protected>
    </Stack>
  );
}
