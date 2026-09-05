// FILE PURPOSE: an ambient type declaration telling TypeScript what an `import`ed `.sql` file
// looks like (a plain string) — without this, `tsc` would error on
// `src/db/migrations/migrations.js`'s `.sql` imports, since TypeScript has no built-in idea
// what type a `.sql` file's default export should be. The other two pieces of this same feature
// are `metro.config.js` (teaches the bundler to treat `.sql` as a source extension) and
// `babel.config.js` (the `inline-import` plugin that actually turns the file into a string).
declare module '*.sql' {
  const content: string;
  export default content;
}
