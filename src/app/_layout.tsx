/**
 * FILE PURPOSE
 * ------------
 * The root layout — expo-router treats this file specially: it wraps every single screen in
 * the app. This is where all the app-wide providers, the always-mounted background components
 * (sheets, toasts, undo, notification routing), and the startup gating are assembled, in the
 * exact order they need to nest.
 *
 * WHERE IT FITS
 * -------------
 * This is one of the very first things that runs on app launch (see `index.js` for what runs
 * even before this). Render order top-to-bottom is also nesting order — outermost wraps
 * everything:
 *   GestureHandlerRootView         — required root for react-native-gesture-handler
 *     SafeAreaProvider              — screen-edge-safe-area awareness for every screen
 *       ThemeProvider (dark)        — expo-router's navigation theme (colors for headers, etc.)
 *         RootErrorBoundary         — catches any crash below this point (src/features/app-shell/)
 *           MigrationGate           — blocks rendering until the database is ready (src/db/)
 *             AppBackground          — the ambient background gradient, behind everything
 *               BottomSheetModalProvider
 *                 RootNavigator      — the actual screens (onboarding vs. main app)
 *                 SheetHost          — the one shared bottom-sheet modal
 *                 UndoHost           — the delete-undo snackbar
 *                 ToastHost          — the save-confirmation toast
 *                 NotificationRouter — routes a notification tap to a screen/sheet
 *             AnimatedSplashOverlay  — sibling to AppBackground; covers everything until ready
 *
 * IMPORTANT
 * ---------
 * `fontsLoaded` gates rendering to `null` before anything else — the native splash screen stays
 * up (see `SplashScreen.preventAutoHideAsync()` below) until the bundled fonts are ready, so no
 * screen ever flashes text in the wrong font. `<MigrationGate>` then holds that same "still
 * showing the native splash" state for a second, longer phase while the database migrates.
 *
 * This file has a `.web.tsx` sibling (`_layout.web.tsx`) that is NOT just a thinner copy of
 * this — it deliberately skips `RootNavigator`'s onboarding-gating logic. See that file's own
 * header comment for exactly why reusing this component as-is would break the web build.
 */

import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { DarkTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { useAppFonts } from '@/constants/fonts';
import { MigrationGate } from '@/db/migration-gate';
import { AppBackground } from '@/ui/app-background';

import { NotificationRouter } from '@/features/app-shell/notification-router';
import { RootErrorBoundary } from '@/features/app-shell/root-error-boundary';
import { RootNavigator } from '@/features/app-shell/root-navigator';
import { SheetHost } from '@/features/app-shell/sheet-host';
import { ToastHost } from '@/features/app-shell/toast-host';
import { UndoHost } from '@/features/transactions/undo-host';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useAppFonts();

  // Keep the native splash up until the bundled fonts resolve; `<MigrationGate>` then holds
  // it until the database is migrated + seeded.
  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider value={DarkTheme}>
          <StatusBar style="light" />
          <RootErrorBoundary>
            <MigrationGate>
              <AppBackground>
                <BottomSheetModalProvider>
                  <RootNavigator />
                  <SheetHost />
                  <UndoHost />
                  <ToastHost />
                  <NotificationRouter />
                </BottomSheetModalProvider>
              </AppBackground>
              <AnimatedSplashOverlay />
            </MigrationGate>
          </RootErrorBoundary>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
