// V1 is dark-only (D33 / SPEC-implementation.md §29.1). Static web export renders dark
// too — no hydration swap needed.
export function useColorScheme(): 'dark' {
  return 'dark';
}
