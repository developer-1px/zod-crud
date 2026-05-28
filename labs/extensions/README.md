# Extension Lab

This directory is a pressure suite for `zod-crud` extensions.

Lab packages are not official public packages. They exist to test whether new product needs can be implemented by composing the public `zod-crud` document facade without adding core concepts.

Rules:

- Import `zod-crud` only through the public package entrypoint.
- Do not import `packages/zod-crud/src/**`.
- Do not add `doc.use(...)`, plugin registration, or global mutation.
- Keep every lab package `private: true`.
- Record public API friction in the package README.

Promotion path:

1. A lab package proves a distinct responsibility.
2. Its source passes `npm run labs:extensions:verify`.
3. The friction report shows no missing core concept, or the missing concept is accepted as a core contract change.
4. Only then move it from `labs/extensions/*` to `packages/*`.

Current labs:

- `annotations`: headless comment/review anchors pressure.
- `active-pointer`: active row/card/block pointer state pressure.
- `autosave`: host-owned autosave orchestration pressure.
- `bulk-edit`: predecessor pressure for the official `@zod-crud/bulk-edit` package.
- `checkpoints`: named snapshot and restore point pressure.
- `command-state`: headless command enabled/disabled state pressure.
- `computed-fields`: host-owned computed/formula field sync pressure.
- `collection-sort`: ordered collection sort/reverse pressure.
- `dirty-state`: predecessor pressure for the official `@zod-crud/dirty-state` package.
- `document-diff`: target value diff/apply pressure.
- `document-outline`: document structure outline and target picker pressure.
- `drop-intent`: headless drag/drop move and payload pressure.
- `field-draft`: temporary invalid field input pressure.
- `patch-preview`: dry-run patch preview and confirmation pressure.
- `persist-web`: predecessor pressure for the official `@zod-crud/persist-web` package.
- `presence-cursors`: remote collaborator cursor/selection pressure.
- `pointer-bookmarks`: patch-stream Pointer bookmark tracking pressure.
- `list-ops`: predecessor pressure for the official `@zod-crud/collection` package.
- `patch-log`: predecessor pressure for the official `@zod-crud/patch-log` package.
- `query-watch`: predecessor pressure for the official `@zod-crud/query-watch` package.
- `record-index`: predecessor pressure for the official `@zod-crud/record-index` package.
- `schema-form`: predecessor pressure for the official `@zod-crud/schema-form` package.
- `selection-model`: predecessor pressure for the official `@zod-crud/selection-model` package.
- `text-search`: document-wide string search and replace pressure.
- `value-factory`: host-owned schema-checked new value factory pressure.
