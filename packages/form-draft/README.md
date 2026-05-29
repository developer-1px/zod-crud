# @zod-crud/form-draft

Official headless form draft extension for temporary input that is not ready to
enter a schema-valid `zod-crud` document.

Use it when a product needs form, property panel, settings, CMS, generated admin,
spreadsheet cell, or import mapping inputs that can be temporarily invalid while
the saved JSON document stays valid.

```ts
import { createFormDraft } from "@zod-crud/form-draft";

const drafts = createFormDraft(doc, {
  parse({ input }) {
    const value = Number(input);
    return Number.isFinite(value)
      ? { ok: true, value }
      : { ok: false, reason: "not a number" };
  },
});

drafts.set("/settings/count", "12");
drafts.set("/settings/title", "Next");
drafts.commitAll("/settings");
```

## Scope

- Hold form draft input outside document state.
- Parse host input with host-owned parser policy.
- Use `doc.schema.accepts` when direct schema paths are available.
- Preflight commits with `doc.canReplace`.
- Commit valid drafts with `doc.replace`.
- Preflight and commit a form/subtree through `doc.canPatch` and `doc.patch`.

## Non-goals

- No rendered input, label, layout, keyboard, focus, IME, masking, or debounce
  policy.
- No built-in number/date/currency parser.
- No schema-derived UI widget selection.
- No plugin registration; this package composes functions and does not call
  `doc.use(...)`.
- No `zod-crud` internal imports.

## Contract

`@zod-crud/form-draft` keeps temporary invalid input outside `doc.value`, asks
host code to parse, checks document capability, then commits one field through
`replace` or a whole form/subtree as one JSON Patch batch.

This keeps core document state schema-valid at all times. Partial input,
formatting, parsing, and validation message presentation remain host concerns.
