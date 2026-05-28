# Changelog

All notable changes to this project are documented here.

## 1.0.0 - 2026-05-28

### Added

- Added the stable document facade for schema-guarded JSON editing:
  `find`, `insert`, `replace`, `delete`, `move`, `duplicate`, `copy`, `cut`,
  `paste`, `undo`, and `redo`.
- Added matching `can*` probes for the document editing verbs so command UIs can
  show disabled reasons without mutating state.
- Added selection-backed defaults for editing verbs where the source or target is
  naturally the current selection.
- Added `zod-crud/react` as the React adapter entrypoint for the same
  `JSONDocument` surface.
- Added extension-lab packages to test whether core concepts can support
  clipboard, persistence, dirty state, query watching, schema forms, selection
  models, record indexes, patch logs, list operations, and bulk editing without
  expanding the core API.
- Added `@zod-crud/clipboard-web` as a browser clipboard extension boundary.
- Added `@zod-crud/collection` as the first official collection editing
  extension for ordered JSON arrays.
- Added `@zod-crud/record-index` as an official stable id-to-pointer extension.
- Added `@zod-crud/selection-model` as an official pointer selection projection
  extension.
- Added standardization checks, public conformance tests, and API Lab coverage
  for the public facade.

### Changed

- Promoted editor feature verbs to the primary document surface while keeping
  JSON Patch through `patch` and `commit` as the explicit escape hatch.
- Standardized document command names around common editing-tool vocabulary:
  Insert, Delete, Find, Replace, Cut, Copy, Paste, Duplicate, Move, Undo, Redo.
- Standardized docs around the outside-in flow:
  `schema -> document -> pointer/query -> can* -> change -> result`.
- Moved browser/system clipboard responsibility out of core and into extension
  composition.
- Updated Workbench/API Lab to expose the public facade directly instead of
  teaching nested internal paths first.
- Kept React lifecycle concerns in `zod-crud/react`; the root package remains
  headless and React-free.

### Fixed

- Aligned `duplicate()` with `canDuplicate()` so both can use the current primary
  selection when the source pointer is omitted.
- Removed stale documentation references that presented nested clipboard methods
  as the primary mutation surface.

### Contract

- Core owns JSON state, JSON Pointer, JSON Patch, JSONPath search, schema
  validation, headless selection, headless clipboard payload flow, undo/redo
  history, and reasoned capability probes.
- Core does not own rendering, DOM focus, keyboard policy, drag and drop,
  command palette UI, system clipboard integration, persistence, transport,
  CRDT/OT conflict resolution, or product-specific command names.
