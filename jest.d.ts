// FILE PURPOSE: an ambient type-declaration file (referenced from `tsconfig.json`'s `include`)
// that makes Jest's global test functions (`describe`, `it`, `expect`, ...) known to TypeScript
// project-wide, so every `*.test.ts(x)` file typechecks without each one needing its own import.
/// <reference types="jest" />
// Makes Jest's globals (describe / it / expect / …) known to TypeScript across the
// whole project without disabling auto-loaded @types. See SPEC-implementation.md §34.
