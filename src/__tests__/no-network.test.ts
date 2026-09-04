/**
 * SPEC-implementation.md §33.2(b) — the no-network assertion. The only code path that can open
 * a socket is `src/services/crash/` (Sentry, and only after `armCrashReporting(true)`); every
 * other source file under `src/domain`, `src/db`, `src/features`, `src/services` must never make
 * a direct network call. This scans those trees and fails the moment one shows up outside that
 * one directory — a static grep, not a runtime check, so it catches the mistake at test time
 * rather than relying on someone remembering to check it by hand.
 */

import { readdirSync, readFileSync } from 'fs';
import { join, relative } from 'path';

const ROOTS = ['src/domain', 'src/db', 'src/features', 'src/services'];
const EXCLUDED_DIR = join('src', 'services', 'crash');

// Real network-call shapes, not the word appearing in prose/comments/string literals —
// `\bfetch\(` won't match `'fetch'` (a breadcrumb category name) or `re-fetch` in a comment.
const PATTERNS: { name: string; re: RegExp }[] = [
  { name: 'fetch(', re: /\bfetch\s*\(/ },
  { name: 'XMLHttpRequest', re: /\bXMLHttpRequest\b/ },
  { name: 'WebSocket', re: /\bWebSocket\b/ },
  { name: 'axios', re: /\baxios\b/ },
];

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listSourceFiles(full));
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry.name)) continue;
    if (/\.(test|d)\.(ts|tsx)$/.test(entry.name)) continue;
    out.push(full);
  }
  return out;
}

const projectRoot = process.cwd();
const files = ROOTS.flatMap((root) => listSourceFiles(join(projectRoot, root))).filter(
  (f) => !relative(projectRoot, f).startsWith(EXCLUDED_DIR),
);

describe('no-network assertion (§33.2b)', () => {
  it('found source files to scan (guards against this test silently scanning nothing)', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it.each(files.map((f): [string, string] => [relative(projectRoot, f), f]))(
    '%s makes no direct network call',
    (_label, file) => {
      const contents = readFileSync(file, 'utf8');
      const hit = PATTERNS.find(({ re }) => re.test(contents));
      expect(hit?.name).toBeUndefined();
    },
  );
});
