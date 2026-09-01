// Jest — see SPEC-implementation.md §34 (testing strategy).
// The centrepiece is unit tests on `src/domain` (pure TS: SMS parser corpus,
// normalization, analytics math, formatter, period math, undo). Component tests
// (RNTL, the V-3 states) and Maestro E2E come with Phase 5 feature work.

/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|@gorhom/.*|@shopify/.*|drizzle-orm|drizzle-kit))',
  ],
  collectCoverageFrom: [
    'src/domain/**/*.{ts,tsx}',
    '!src/domain/**/*.d.ts',
    '!src/domain/**/__fixtures__/**',
  ],
};
