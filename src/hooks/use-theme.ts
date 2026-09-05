import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

/**
 * The hook most components use to get actual color values: `const { bg, text } = useTheme()`.
 * It just looks up the current scheme (`useColorScheme()` — always `'dark'` right now, see that
 * hook) in the `Colors` token table from `src/constants/theme.ts`. Kept as its own hook rather
 * than having every component read `Colors.dark` directly, so once a light theme exists, only
 * this one lookup needs to change — components calling `useTheme()` won't need touching.
 */
export function useTheme() {
  return Colors[useColorScheme()];
}
