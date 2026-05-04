# zod-crud Playground Rules

This app is a thin playground for the `zod-crud` core package. It is not a
product app, landing page, scenario gallery, or marketing showcase.

## Do

- Keep the treegrid editor as the first screen and primary surface.
- Map user commands directly to `zod-crud` core APIs.
- Display core results as returned: `ok`, `reason`, `nodeId`,
  `focusNodeId`, `focusNodeIds`, and `changes`.
- Make every visible panel map to core state or generic editor integration
  state.
- Highlight treegrid changes only from `OperationResult.changes`.
- Visualize focus and selection from `focusNodeId`, `focusNodeIds`, and the
  current selection state; do not infer hidden focus reasons in the UI.
- Use core `can*` APIs for command availability.
- Keep schema/entity switching only to demonstrate schema-guarded editing.
- Keep inspector panels focused on core state: selection, clipboard, command
  result, changed nodes, schema, and JSON output.
- Split playground code by responsibility.
- Import files directly. Do not add internal barrels.

## Don't

- Do not add landing pages, hero sections, marketing copy, onboarding flows,
  fake analytics, or product-style navigation.
- Do not add gradients, decorative icons, ornamental animations, charts,
  dashboards, tutorials, or saved views.
- Do not add demo-only business workflows.
- Do not infer paste, focus, validation, batch, undo, redo, or change policies
  in the UI when the policy belongs in core.
- Do not compute JSON diffs in the playground. Use core `changes`.
- Do not grow `main.tsx` with selection, command, entity, treegrid, or inspector
  responsibilities.
- Do not add UI features unless they expose or verify `zod-crud` core behavior.

## Feature Gate

A new playground feature is admissible only when it answers at least one of
these:

- Which core API does this exercise?
- Which core result does this reveal?
- Which generic editor integration concern does this validate?

If none applies, keep it out of the playground.
