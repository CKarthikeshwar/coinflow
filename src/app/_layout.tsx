import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { useAppFonts } from '@/constants/fonts';
import { MigrationGate } from '@/db/migration-gate';
import { AppBackground } from '@/ui/app-background';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useAppFonts();

  // Keep the native splash up until the bundled fonts resolve; `<MigrationGate>` then holds
  // it until the database is migrated + seeded. The rest of the provider stack (gesture
  // handler, sheet registry) lands in later steps.
  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <ThemeProvider value={DarkTheme}>
        <StatusBar style="light" />
        <MigrationGate>
          <AppBackground>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: 'transparent' },
              }}
            />
          </AppBackground>
          <AnimatedSplashOverlay />
        </MigrationGate>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
