# @interactive-os/json-document-sparse-record

Lab sparse-record entry editing extension for `@interactive-os/json-document` documents.

Use it when a product stores editor state in keyed JSON records and wants to
delegate add/replace/remove/no-op patch planning to json-document:

```ts
import { createSparseRecord } from "@interactive-os/json-document-sparse-record";

const sparse = createSparseRecord(doc);

sparse.edit({
  root: "/cells",
  set: { A1: "done", B2: "todo" },
  remove: ["C3"],
});
```

The app decides product keys and normalization. For a spreadsheet, that means
the app still owns A1 naming, bounds, formula parsing, and whether an empty cell
means "remove this key". This package owns the document edit implication once
the app declares the keyed entry intent.

## Scope

- Read one or more sparse record roots and plan entry-level `add`, `replace`,
  `remove`, and `noop` decisions.
- Accept `set` entries and `remove` keys in one command, across multiple record
  roots, with one `doc.canPatch` preflight and one `doc.patch` apply.
- Skip no-ops with JSON equality by default, or a host-provided equality
  predicate for product-normalized values.
- Return structured decisions, operation counts, and planned JSON Patch
  operations.
- Expose `canEdit` beside `edit`.

## Non-goals

- No spreadsheet A1 semantics, rectangular selection expansion, row/column
  bounds, or formula/value normalization.
- No rendered grid selection, focus recovery, keyboard policy, or UI error
  presentation.
- No deep merge, nested object defaulting, or array row/table editing.
- No plugin registration; no `@interactive-os/json-document` internal imports.

## Friction report

The current public document facade is enough for sparse record entry edits:
`doc.at` reads the record roots, `appendSegment` builds entry pointers,
`doc.canPatch` validates the whole patch batch, and `doc.patch` applies it
atomically.

This lab exists because composing adjacent packages still leaves app code with
too much document mutation knowledge:

- `apply-defaults` covers add-only record writes.
- `batch-update` covers replace-only existing pointers.
- `document-diff` can apply a mixed result after the app builds the next parent
  record.

Sparse-record keeps the app at the intent level: set these keys, remove these
keys, and let the package decide whether each entry is an add, replace, remove,
or no-op. Product normalization remains host-owned.
