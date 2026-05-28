# @zod-crud/form-draft

Lab form draft extension for `zod-crud` documents.

Use it to test whether temporary invalid input state can stay outside the core
document while commits still use the public schema and capability surface.

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
- Validate parsed values with `doc.schema.accepts`.
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

## Friction report

The public facade is enough for form drafts. The extension keeps temporary
invalid input outside `doc.value`, asks host code to parse, checks schema
acceptance, then commits one field through `replace` or a whole form/subtree as
one JSON Patch batch.

This keeps core document state schema-valid at all times. Partial input,
formatting, parsing, and validation message presentation remain host concerns.
