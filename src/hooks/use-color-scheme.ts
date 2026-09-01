// V1 is dark-only (D33 / SPEC-implementation.md §29.1). The hook is kept — and kept in
// its platform-split form (see `.web.ts`) — so the rest of the app has one place to read
// the scheme from if light mode ever ships.
export function useColorScheme(): 'dark' {
  return 'dark';
}
