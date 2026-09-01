import { defineConfig } from 'drizzle-kit';

// SPEC-implementation.md §20.2. `drizzle-kit generate` reads the schema and writes
// versioned SQL + a journal + an Expo migrations barrel into `src/db/migrations/`,
// which is committed (not generated at build time).
export default defineConfig({
  dialect: 'sqlite',
  driver: 'expo',
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
});
