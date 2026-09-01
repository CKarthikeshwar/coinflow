# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Expo SDK 57 — read the versioned docs first

This project targets `expo@~57.0.18` / `react-native@0.86.3` / `react@19.2` / `expo-router@~57`.
Expo v57 changed a lot of APIs. Before writing or editing any Expo/RN code, consult
https://docs.expo.dev/versions/v57.0.0/ rather than relying on memory of older SDKs.
`experiments.reactCompiler` and `experiments.typedRoutes` are both **on** (`app.json`).

## Commands

```bash
npm run start          # expo start (dev server / Metro)
npm run android        # expo start --android
npm run ios            # expo start --ios
npm run web            # expo start --web
npm run lint           # expo lint (ESLint; no eslint config committed yet — first run scaffolds one)
npx tsc --noEmit       # typecheck (tsconfig is strict)
npm run reset-project  # DESTRUCTIVE: moves src/ and scripts/ into example/ and scaffolds a blank src/app
```

No test runner is configured yet. `SPEC/PLAN.md` §8 calls for Jest unit tests on business logic
once implementation starts — add the tooling when that work begins.

## Architecture

### This repo is mid-transition: template → "CoinFlow"

`src/app` and `src/components` are still the **unmodified `create-expo-app` / expo-router
template** (a "Welcome to Expo" home screen + an "Explore" tab). The actual product is CoinFlow,
a personal-finance / expense tracker whose scope is frozen in `SPEC/idea.md`.

`SPEC/PLAN.md` is the authoritative process and describes a strict design→implementation boundary
(IA → visual direction → web prototypes in `design-prototype/` → `SPEC-UI-UX.md` →
`SPEC-implementation.md` → only then implement in `src/app`).

**Do not build CoinFlow features in `src/app` until `SPEC-UI-UX.md` is frozen.** Prototype in
`design-prototype/` first. `SPEC-UI-UX.md` and `SPEC-implementation.md` are currently empty
placeholder files at the repo root. If a product/UX/architecture decision is ambiguous, update the
relevant SPEC doc and ask rather than guessing in code.

### App shell (template code, but the patterns carry forward)

- **Routing**: `expo-router` with the app entry at `expo-router/entry` (`package.json` `main`).
  Routes live under `src/app/` (custom location — the default is `app/`). `src/app/_layout.tsx` is
  the root layout: wraps everything in `ThemeProvider`, renders `AnimatedSplashOverlay`, then
  `AppTabs`.
- **Path aliases** (`tsconfig.json`): `@/*` → `src/*`, `@/assets/*` → `assets/*`. Use these, not
  relative `../../` paths.
- **Platform-specific files**: `.web.tsx` / `.web.ts` siblings override the native file on web.
  Examples: `app-tabs.tsx` (native `NativeTabs` from `expo-router/unstable-native-tabs`) vs
  `app-tabs.web.tsx` (custom tab bar via `expo-router/ui`); `use-color-scheme.ts` vs
  `use-color-scheme.web.ts` (web variant defers to `'light'` until hydration for static rendering);
  `animated-icon.tsx` vs `animated-icon.web.tsx`. When you add cross-platform behavior, follow this
  split rather than branching on `Platform.OS` everywhere (though `Platform.select` / `Platform.OS`
  is used for smaller divergences).
- **Web** ships as static output (`app.json` → `web.output: "static"`) via `react-native-web`.

### Theming

`src/constants/theme.ts` is the single source of design tokens (`Colors`, `Fonts`, `Spacing`,
`BottomTabInset`, `MaxContentWidth`) — read it directly. Prefer the named `Spacing` scale over raw
numbers. `useTheme()` (`src/hooks/use-theme.ts`) resolves the current color scheme to a `Colors[...]` object.
`ThemedText` and `ThemedView` are the base primitives — pass `type` for the text/surface variant and
`themeColor` for an explicit color key. Build new UI from these, not bare `<Text>` / `<View>`.

### Splash / animation

Custom animated splash: `AnimatedSplashOverlay` in `src/components/animated-icon.tsx`.
`SplashScreen.preventAutoHideAsync()` is called at module load in `_layout.tsx`;
`SplashScreen.hideAsync()` fires on the overlay's first `onLayout`, then a reanimated `Keyframe`
transition plays. Animations use `react-native-reanimated` v4 `Keyframe`s plus
`react-native-worklets` (`scheduleOnRN`).

## Tooling notes

- `.vscode/settings.json` runs `source.fixAll`, `source.organizeImports`, and `source.sortMembers`
  on save. Keep imports sorted/grouped to match.
- `.impeccable/` holds config for the `impeccable` design-critique skill used during the prototype
  phase.
- An OpenAI Codex config directory (`.codex/`) exists but contains only `hooks.json` (no importable
  MCP servers / commands / skills). Nothing to import.
