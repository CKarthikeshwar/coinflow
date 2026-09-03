// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Let Drizzle's migration barrel `import … from './0000_*.sql'` (SPEC-implementation.md §20.3).
config.resolver.sourceExts.push('sql');

// Test files live next to the screens they test (e.g. `src/app/categories.test.tsx`), so
// expo-router's file-based routing was sweeping them into the route table and Metro tried to
// bundle them for every platform — `@testing-library/react-native` pulls in Node's `console`
// module, which native bundling can't resolve, breaking `expo export --platform android`. Jest
// finds these files through `jest.config.js`, not this file, so blocking them here only removes
// them from the app bundle / route discovery, never from `npm test`.
config.resolver.blockList = [...config.resolver.blockList, /\.test\.[jt]sx?$/];

module.exports = config;
