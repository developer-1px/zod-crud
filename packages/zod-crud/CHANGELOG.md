# Changelog

All notable package changes are recorded here.

## 0.12.0 - 2026-05-18

- Split the React entrypoint to `zod-crud/react`, keeping root `zod-crud` importable without React.
- Kept package exports limited to root `zod-crud` and `zod-crud/react`; verb modules remain source layout, not public subpaths.
- Kept direct Zod JSON Schema conversion on Zod itself; zod-crud exposes schema introspection through the document facade.
- Kept undo/redo history on the document facade instead of standalone root reducer exports.
- Removed unused standalone undo/redo verb composers; document history remains the undo/redo owner.
- Removed the target-spec document so source, SPEC, and package docs remain the only public contract.
- Kept edit verbs behind the document facade instead of standalone root exports.
- Kept only the JSON boundary serializer instead of schema parse wrappers.
- Kept JSON equality as an internal helper instead of a root export.
- Added tarball smoke checks for root, React, and private source-layout subpaths.
- Added package export consistency checks and type-regression file coverage.

## 0.7.0 - 2026-05-10

- Canonicalized the library as a Zod-guarded JSON tree layer over RFC 6901, RFC 6902, RFC 9535, W3C Selection vocabulary, and JSON Schema bridging.
- Added the 10 verb closure: `select`, `move`, `cut`, `copy`, `paste`, `duplicate`, `undo`, `redo`, `find`, and `replace`.
- Added RFC/core and verb closure regression tests.
