// Committed on purpose. Locally, `npx expo` regenerates `expo-env.d.ts` with this same
// reference, but that file is git-ignored, so CI's `tsc` never sees Expo's ambient types
// (CSS / CSS-module imports, typed routes, `process.env` keys). This file restores them.
// It resolves to the same `expo/types` package as `expo-env.d.ts`, so having both locally
// is harmless.
/// <reference types="expo/types" />
