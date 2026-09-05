/**
 * FILE PURPOSE
 * ------------
 * Loads the app's two custom fonts (Manrope for headings/figures, Geist for everything else)
 * before the app renders. `@expo-google-fonts/*` ships the actual font files; this just
 * registers one loadable "family name" per weight (e.g. `Manrope_600SemiBold`), matching the
 * names `fontFamily()` in `src/constants/theme.ts` expects to find.
 *
 * WHERE IT FITS
 * -------------
 * `useAppFonts()` is called once, in `src/app/_layout.tsx`, and the root layout deliberately
 * renders nothing (`return null`) until it resolves — that's what prevents text from
 * flashing in the plain system font for a moment before the real fonts are ready.
 */

import {
  Geist_400Regular,
  Geist_500Medium,
  Geist_600SemiBold,
  Geist_700Bold,
} from '@expo-google-fonts/geist';
import {
  Manrope_300Light,
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
} from '@expo-google-fonts/manrope';
import { useFonts } from 'expo-font';

export function useAppFonts() {
  return useFonts({
    Manrope_300Light,
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Geist_400Regular,
    Geist_500Medium,
    Geist_600SemiBold,
    Geist_700Bold,
  });
}
