# zod-crud Playground Rules

This app is a thin API playground for the `zod-crud` core package. It is not a
product app, landing page, scenario gallery, admin dashboard, or UI
compatibility demo.

## Do

- Keep the `JsonDoc` tree as the first-class surface.
- Keep tree interaction row-based. Columns are display-only.
- Keep all runtime-callable APIs reachable from the command matrix.
- Keep `*Many` APIs visible as separate API entries.
- Map user commands directly to `zod-crud` public APIs.
- Keep keyboard shortcuts mapped to the same public API calls that buttons use.
- Keep user command mapping, input preparation, and public call execution as
  separate modules.
- Keep `Enter` mapped only to selected-row primitive value editing. Do not edit
  `path`, `key`, or `type` in the grid.
- Display core results as returned whenever practical: `ok`, `reason`,
  `nodeId`, `focusNodeId`, `focusNodeIds`, and `changes`.
- Highlight tree changes only from `OperationResult.changes`.
- Use core `can*` APIs for capability checks and dry-run behavior.
- Keep primitive value editing tied to `update(nodeId, value)` validation and
  commit results.
- If the selected value is backed by a Zod enum or literal-union schema, expose
  only a select control for that value. Do not allow free-text entry.
- Display enum and literal-union values as value-column badges when not editing.
- Keep schema switching preset-based until runtime Zod code entry is explicitly
  added.
- Split playground code by responsibility.
- Import files directly. Do not add internal barrels.

## Don't

- Do not add landing pages, hero sections, marketing copy, onboarding flows,
  fake analytics, product-style navigation, or dashboard workflows.
- Do not add decorative gradients, charts, tutorials, saved views, or demo-only
  business flows.
- Do not hide core APIs behind app-only facades in the API sidebar.
- Do not infer paste, focus, validation, batch, undo, redo, or change policies
  in the UI when the policy belongs in core.
- Do not compute JSON diffs in the playground. Use core `changes`.
- Do not add runtime schema editing in this scope.
- Do not add object/array subtree replacement controls in this scope.

## Feature Gate

A new playground feature is admissible only when it answers at least one of
these:

- Which public API does this exercise?
- Which core result does this reveal?
- Which generic editor integration concern does this validate?

If none applies, keep it out of the playground.
