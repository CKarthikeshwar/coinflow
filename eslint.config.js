// FILE PURPOSE: configures ESLint, the linter `npm run lint` (`expo lint`) runs. This project
// doesn't define its own custom rules — it uses Expo's own recommended flat config as-is
// (which itself bundles React/React Native/React Hooks/TypeScript rules), and just adds one
// thing: telling ESLint to skip generated/vendored/native-build directories it should never
// need to look inside (`dist/`, `.expo/`, `node_modules/`, the generated `android/`/`ios/`
// native project folders, and the unused `example/` folder `npm run reset-project` would create).
//
// https://docs.expo.dev/guides/using-eslint/
const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...[].concat(expoConfig),
  {
    ignores: ['dist/*', '.expo/*', 'node_modules/*', 'android/*', 'ios/*', 'example/*'],
  },
];
