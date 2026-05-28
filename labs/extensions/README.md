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

- `bulk-edit`: JSONPath batch replace/delete command pressure.
- `dirty-state`: saved baseline, dirty tracking, discard pressure.
- `persist-web`: storage host save/restore/watch pressure.
- `list-ops`: predecessor pressure for the official `@zod-crud/collection` package.
- `patch-log`: audit log and patch replay pressure.
- `query-watch`: predecessor pressure for the official `@zod-crud/query-watch` package.
- `record-index`: predecessor pressure for the official `@zod-crud/record-index` package.
- `schema-form`: predecessor pressure for the official `@zod-crud/schema-form` package.
- `selection-model`: predecessor pressure for the official `@zod-crud/selection-model` package.
