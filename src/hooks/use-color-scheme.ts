// This app's design is dark-mode-only in its current version — there is no light theme yet,
// regardless of the device's own system setting. This hook always returns 'dark'. It's kept as
// a hook (not just hardcoding 'dark' at every call site) and kept in its native/`.web.ts`
// platform-split form specifically so there's already one clear, single place to introduce a
// real light/dark distinction later, without having to hunt down every place color depends on
// theme throughout the app.
export function useColorScheme(): 'dark' {
  return 'dark';
}
