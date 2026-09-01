import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { useAppFonts } from '@/constants/fonts';
import { AppBackground } from '@/ui/app-background';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useAppFonts();

  // Keep the native splash up until the bundled fonts resolve, so text never flashes in
  // the system font. The full provider stack (gesture handler, migration gate, sheet
  // registry) lands in later steps.
  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <ThemeProvider value={DarkTheme}>
        <StatusBar style="light" />
        <AppBackground>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: 'transparent' },
            }}
          />
        </AppBackground>
        <AnimatedSplashOverlay />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
