/** Thin re-export so every repository imports the live-query hook from one place — the `.web`
 * sibling swaps it for a web-safe stub (§18.3) without touching each repository file. */
export { useLiveQuery } from 'drizzle-orm/expo-sqlite';
