import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

/** Resolves the current colour scheme to a `Colors[...]` object. Dark-only in V1. */
export function useTheme() {
  return Colors[useColorScheme()];
}
