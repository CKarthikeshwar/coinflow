// https://docs.expo.dev/guides/using-eslint/
const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...[].concat(expoConfig),
  {
    ignores: ['dist/*', '.expo/*', 'node_modules/*', 'android/*', 'ios/*', 'example/*'],
  },
];
