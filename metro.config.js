// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Let Drizzle's migration barrel `import … from './0000_*.sql'` (SPEC-implementation.md §20.3).
config.resolver.sourceExts.push('sql');

module.exports = config;
