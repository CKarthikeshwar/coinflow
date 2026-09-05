// Web build's replacement for `use-color-scheme.ts` — currently identical (`'dark'` always),
// since the app is dark-mode-only everywhere. Exists as its own file only so the native/web
// split is complete and consistent with the rest of the codebase's platform-file convention.
export function useColorScheme(): 'dark' {
  return 'dark';
}
