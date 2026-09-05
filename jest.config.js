// FILE PURPOSE: configures Jest, the test runner `npm test` invokes. Built on the `jest-expo`
// preset (which knows how to handle React Native's JSX/native-module quirks), with a few
// project-specific fixes below for packages Jest wouldn't otherwise know how to load.
//
// The centrepiece of this project's test suite is unit tests on `src/domain` (pure TS: the SMS
// parser corpus, account normalization, analytics math, money/date formatting, period math) —
// see `collectCoverageFrom` below, which only tracks coverage for that folder. Component tests
// (`@testing-library/react-native`, one `*.test.tsx` next to most screens/features) and the
// Maestro end-to-end flow in `e2e/` cover the UI layer on top of that.

/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  resolver: 'react-native-worklets/jest/resolver',
  transformIgnorePatterns: [
    // F9's chart libs (`d3-shape`/`d3-scale`) ship pure ESM with no CJS build (`"type":
    // "module"`, no `lucide-react-native`-style CJS escape hatch to redirect to instead) — need
    // transforming like the RN/Expo packages already listed here, not left for Jest to skip.
    // Their own transitive deps (also ESM-only) are listed too.
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|@gorhom/.*|@shopify/.*|drizzle-orm|drizzle-kit|d3-shape|d3-scale|d3-array|d3-color|d3-format|d3-interpolate|d3-path|d3-time|d3-time-format|internmap))',
  ],
  // `lucide-react-native`'s package.json "exports" maps a "react-native" condition straight to
  // its `.mjs` build, which Jest's transform (keyed by .js/.jsx/.ts/.tsx) never touches — force
  // resolution to the plain CJS build instead of fighting the exports map.
  moduleNameMapper: {
    '^lucide-react-native$': '<rootDir>/node_modules/lucide-react-native/dist/cjs/lucide-react-native.js',
    // RNTL can't query into the real `Modal`'s content (needs an app-root `AppContainer` that
    // doesn't exist in a bare `render()`) — see `__mocks__/rn-modal.tsx`.
    '^react-native/Libraries/Modal/Modal$': '<rootDir>/__mocks__/rn-modal.tsx',
  },
  collectCoverageFrom: [
    'src/domain/**/*.{ts,tsx}',
    '!src/domain/**/*.d.ts',
    '!src/domain/**/__fixtures__/**',
  ],
};
