# Changelog

All notable changes to this project are documented here.

## Unreleased

### Added

- Added `@zod-crud/id-resolver` as an official headless extension for resolving
  scoped stable ids to current JSON Pointers.
- Added `@zod-crud/patch-preview` as an official headless extension for
  previewing schema-safe JSON Patch changes before applying them.
- Added `@zod-crud/search-replace` as an official headless extension for
  searching and replacing JSON string fields.
- Added `@zod-crud/proposed-changes` as an official headless extension for
  reviewing, accepting, and rejecting proposed JSON Patch changes.
- Added `@zod-crud/comments` as an official headless extension for review
  comments anchored to JSON Pointers.
- Added `@zod-crud/form-draft` as an official headless extension for keeping
  temporary invalid input outside schema-valid JSON documents until commit.
- Added `@zod-crud/protected-ranges` as an official headless extension for
  guarding edits to locked JSON Pointer ranges before core capability checks.
- Added `@zod-crud/snippets` as an official headless extension for inserting
  reusable JSON payload snippets through schema-safe paste.

### Changed

- Clarified the `@zod-crud/search-replace` delegation boundary: literal JSON
  string-field find/replace is standardized, while regex engines, rendered text
  extraction, advanced search ranking, and regex replace-all capture policy
  remain host-owned.
- Renamed lab extension packages toward common editor command names: `batch-set`
  to `batch-update`, `clear-values` to `clear-contents`, `coerce` to
  `convert-type`, `collection-sort` to `sort-items`, `computed-fields` to
  `calculated-fields`, `convert-node-kind` to `convert-block-type`, `cycle` to
  `toggle-value`, `ensure-fields` to `apply-defaults`, `fill-empty` to
  `fill-blanks`, `forward-fill` to `fill-down`, `grid-paste` to `paste-cells`,
  `limit` to `limit-items`, `move-selection` to `move-selected`, `number-step`
  to `increment-number`, `pad` to `pad-text`, `paste-compatible` to
  `paste-special`, `presence-cursors` to `live-cursors`, `reindex` to
  `renumber-items`, `set-membership` to `toggle-option`, `slugify` to
  `generate-slug`, `swap` to `swap-items`, `text-transform` to `change-case`,
  `truncate` to `trim-text`, and `wrap-unwrap` to `wrap-selection`.
- Changed the default document execution error policy to `strict: false`.
  Callers that want `JSONCrudError` throws now opt in with `strict: true`.
- Changed top-level `doc.undo()` and `doc.redo()` to return
  `JSONCapabilityResult` instead of boolean so command execution follows the
  same `can* -> command -> result` shape.
- Changed clipboard, paste, duplicate, web clipboard, and persistence failure
  diagnostics to use `reason` instead of result-level `message`. Validation
  `violations[].message` and JavaScript `Error.message` remain unchanged.

### Fixed

- Added lab extension runtime import smoke coverage so generated `dist`
  artifacts cannot contain invalid JavaScript identifiers after feature renames.
- Clarified clipboard spread docs: multi-source clipboard buffer paste spreads
  by default at array insertion targets, while direct array payload paste needs
  explicit `spread: true`.
- Added semantic contract references for result/error, selection, and schema
  introspection to LLM-facing docs.

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
  annotation anchors, autosave, checkpoints, clipboard, persistence, dirty
  state, schema forms, presence cursors, patch logs, bulk editing, computed
  fields, collection sorting, document diffs, document outlines, field drafts,
  patch previews, Pointer bookmarks, document-wide text search, and drag/drop
  intents without expanding the core API.
- Added `@zod-crud/clipboard-web` as a browser clipboard extension boundary.
- Added `@zod-crud/collection` as the first official collection editing
  extension for ordered JSON arrays.
- Added `@zod-crud/schema-form` as an official schema-backed field descriptor
  extension.
- Added `@zod-crud/dirty-state` as an official clean-baseline dirty tracking
  extension.
- Added `@zod-crud/bulk-edit` as an official JSONPath replace-all/delete-all
  extension.
- Added `@zod-crud/patch-log` as an official applied-patch recording and replay
  extension.
- Added `@zod-crud/persist-web` as an official local document persistence
  extension for browser storage-like hosts.
- Added deterministic `persist-web.watch().flush()` / `status()` affordances for
  downstream integration tests.
- Added optional `bulk-edit` command metadata forwarding for labeled replace-all
  and delete-all changes.
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
- Aligned extension docs with shipped packages and kept lab candidates out of
  the official extension list.

### Contract

- Core owns JSON state, JSON Pointer, JSON Patch, JSONPath search, schema
  validation, headless selection, headless clipboard payload flow, undo/redo
  history, and reasoned capability probes.
- Core does not own rendering, DOM focus, keyboard policy, drag and drop,
  command palette UI, system clipboard integration, persistence, transport,
  CRDT/OT conflict resolution, or product-specific command names.
