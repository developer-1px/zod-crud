# Changelog

All notable package changes are recorded here.

## 0.12.0 - 2026-05-18

- Split the React entrypoint to `zod-crud/react`, keeping root `zod-crud` importable without React.
- Exposed all ten verb modules through package `exports`.
- Added tarball smoke checks for root, React, and verb subpath imports.
- Added package export consistency checks and type-regression file coverage.

## 0.7.0 - 2026-05-10

- Canonicalized the library as a Zod-guarded JSON tree layer over RFC 6901, RFC 6902, RFC 9535, W3C Selection vocabulary, and JSON Schema bridging.
- Added the 10 verb closure: `select`, `move`, `cut`, `copy`, `paste`, `duplicate`, `undo`, `redo`, `find`, and `replace`.
- Added RFC/core and verb closure regression tests.
