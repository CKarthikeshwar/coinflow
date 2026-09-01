// Drizzle's Expo migration barrel imports the generated `.sql` files as strings
// (SPEC-implementation.md §20.3). Metro handles this at runtime via `metro.config.js`
// (`sourceExts` += 'sql'); this declaration is what lets `tsc` resolve the import.
declare module '*.sql' {
  const content: string;
  export default content;
}
