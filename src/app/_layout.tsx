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
