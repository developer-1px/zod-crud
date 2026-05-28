# Extension Lab

This directory is a pressure suite for `zod-crud` extensions.

Lab packages are not official public packages. They exist to test whether new product needs can be implemented by composing the public `zod-crud` document facade without adding core concepts.

Concept:

```text
app feature
└─ extension capability
   └─ zod-crud public primitives
```

An extension is a reusable headless editor capability. It is not the complete app
feature, and it is not a core primitive. The name should make the user-facing
capability obvious before someone reads the source.

Naming test:

- The package must fit: `Use @zod-crud/<name> to <buildable capability>.`
- Prefer standard or de-facto editor terms: clipboard, selection, comment,
  presence, history, search, outline, form, persistence.
- Avoid names that only describe an internal mechanism or pressure test.
- If the name cannot explain what a downstream editor can build with it, keep it
  lab-only or rename it before promotion.
- Do not keep convenience wrappers as packages. If core public APIs already make
  a helper straightforward, document it as a recipe instead of preserving a lab
  package.

Rules:

- Import `zod-crud` only through the public package entrypoint.
- Do not import `packages/zod-crud/src/**`.
- Do not add `doc.use(...)`, plugin registration, or global mutation.
- Keep every lab package `private: true`.
- Record public API friction in the package README.

Promotion path:

1. A lab package proves a distinct responsibility.
2. Its source passes `npm run labs:extensions:verify`.
3. Its name passes the capability promise test without relying on implementation
   details.
4. The friction report shows no missing core concept, or the missing concept is
   accepted as a core contract change.
5. Only then move it from `labs/extensions/*` to `packages/*`.

Current labs:

- `comments`: build review comments anchored to document
  structure.
- `autosave`: schedule host-owned saves from document changes.
- `checkpoints`: name and restore document snapshots.
- `collection-sort`: sort or reverse ordered JSON arrays.
- `computed-fields`: sync host-computed formula/derived fields.
- `document-diff`: produce and apply patch changes toward a target document.
- `outline`: build a navigable document tree.
- `drag-drop`: convert drag/drop input into move or paste operations.
- `form-draft`: hold temporary form input before committing valid JSON.
- `layer-order`: reorder visual stack arrays with bring/send commands.
- `patch-preview`: preview patch effects before confirmation.
- `presence-cursors`: track remote collaborator cursors and selections.
- `bookmarks`: keep named document locations stable across edits.
- `search-replace`: find and replace text across document string fields.
- `snippets`: insert reusable JSON payloads with schema-safe paste checks.
