/**
 * Web variant — SPEC-implementation.md §18.3 (Android-only, D3). F12's onboarding `<Redirect>`
 * (see `_layout.tsx`) reads `useSetting('onboardingDone')` live at the root, every render — but
 * `useLiveQuery`'s own `.web.ts` stub (§18.3's original fix) returns `updatedAt: undefined`
 * *forever* on web, since no query ever resolves there. A shared root layout gating on that
 * would leave the entire web app stuck rendering nothing, permanently — not just the individual
 * screens §18.3 already scoped that risk to. Kept as a separate, simpler file rather than an
 * in-component `Platform.OS` branch: same convention every other web split in this app already
 * uses. No onboarding redirect here; each route's own `.web.tsx` twin already renders
 * `AndroidOnlyNotice` instead of touching the database.
 */

import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { useAppFonts } from '@/constants/fonts';
import { MigrationGate } from '@/db/migration-gate';
import { AppBackground } from '@/ui/app-background';

import { NotificationRouter } from '@/features/app-shell/notification-router';
import { SheetHost } from '@/features/app-shell/sheet-host';
import { ToastHost } from '@/features/app-shell/toast-host';
import { UndoHost } from '@/features/transactions/undo-host';

SplashScreen.preventAutoHideAsync();

export default function RootLayoutWeb() {
  const [fontsLoaded] = useAppFonts();

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider value={DarkTheme}>
          <StatusBar style="light" />
          <MigrationGate>
            <AppBackground>
              <BottomSheetModalProvider>
                <Stack
                  screenOptions={{
                    headerShown: false,
                    contentStyle: { backgroundColor: 'transparent' },
                  }}
                />
                <SheetHost />
                <UndoHost />
                <ToastHost />
                <NotificationRouter />
              </BottomSheetModalProvider>
            </AppBackground>
            <AnimatedSplashOverlay />
          </MigrationGate>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
