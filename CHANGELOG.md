# Changelog

The publishable package changelog lives in
[`packages/zod-crud/CHANGELOG.md`](./packages/zod-crud/CHANGELOG.md).

This root file records monorepo-level release notes only.

## 0.12.0 - 2026-05-18

- Split the package into a React-free root entrypoint (`zod-crud`) and a React
  entrypoint (`zod-crud/react`).
- Added the headless `createJSONDocument` facade with the same
  `value`/`ops`/`commands`/`can`/`selection`/`history` surface as
  `useJSONDocument`.
- Kept lower-level React hooks (`useJSON`, `useSelection`, `useJSONSlice`,
  `useDraft`, `useField`) behind `zod-crud/react`.
- Exposed all 10 headless verb modules through explicit package subpath
  exports.
- Added package smoke and export-consistency checks for root, React, and verb
  subpath imports.

## 0.7.0 - 2026-05-10

- Canonicalized zod-crud as a Zod-guarded JSON tree layer over RFC 6901,
  RFC 6902, RFC 9535, W3C Selection vocabulary, and JSON Schema bridging.
- Added the 10 verb closure: `select`, `move`, `cut`, `copy`, `paste`,
  `duplicate`, `undo`, `redo`, `find`, and `replace`.
- Added standards coverage and verb closure regression tests.

## 0.1.0 - 2026-04

- Initial package contract around schema-guarded JSON CRUD, clipboard, and
  history primitives.
