// `babel-preset-expo` is the default when there's no config; it's named explicitly here
// only so we can add `inline-import`, which inlines Drizzle's `.sql` migration files as
// strings at build time (SPEC-implementation.md §20.3 — pairs with `sourceExts` in
// metro.config.js). React Compiler stays on via the `app.json` experiment.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [['inline-import', { extensions: ['.sql'] }]],
  };
};
