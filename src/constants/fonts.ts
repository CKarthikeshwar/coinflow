/**
 * Bundled fonts (SPEC-UI-UX.md §3.2). Manrope 300/400/500/600/700 + Geist 400/500/600/700.
 * `@expo-google-fonts/*` ships the TTFs; `useAppFonts()` registers one family name per
 * weight, matching the `fontFamily()` map in `theme.ts`. The root layout blocks first
 * paint until this resolves so text never flashes in the system font.
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
