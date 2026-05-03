# zod-crud Command Showcase Spec

This document defines the local showcase scope. The library contract remains in
`packages/zod-crud/spec.md`.

## Purpose

The showcase is a small browser JSON editor harness for user input commands
that map to `zod-crud` operations.

It is not a design-system demo, SSOT application framework, schema-bound UI
builder, or product surface.

## Required Commands

The app must handle these keyboard inputs:

- `Cmd+C`: `copy(selectedId)`
- `Cmd+X`: `cut(selectedId)`
- `Cmd+V`: `paste(selectedId)`
- `Delete`: `delete(selectedId)`
- `Cmd+Z`: `undo()`
- `Cmd+Shift+Z`: `redo()`

The same command handler may also accept `Ctrl` on non-macOS keyboards.

## Required Surface

The app must show:

- the registered Zod entities
- the active entity schema source
- a `JsonDoc` treegrid
- the selected JSON node
- the current JSON output
- the internal clipboard preview
- the last command result

## Treegrid Navigation

The treegrid must keep one active cell.

- `ArrowUp`: move to the previous visible row
- `ArrowDown`: move to the next visible row
- `ArrowLeft`: move to the previous column
- `ArrowRight`: move to the next column
- `Home`: move to the first column in the current row
- `End`: move to the last column in the current row
- `Space`: expand or collapse the active row when it has children

## Focus Recovery

After a successful paste, the active row must follow the `nodeId` returned by
the `zod-crud` paste result.

- Child or sibling paste selects the newly inserted subtree root.
- Overwrite paste selects the overwritten target node because its root id is
  preserved by `zod-crud`.
- Ancestors of the selected paste result are expanded so the focused row stays
  visible.

After a successful redo, the active row must be chosen from the `JsonDoc`
before/after diff.

- If redo inserts a subtree, focus the inserted subtree root.
- If redo changes an existing node, focus the changed node.
- If redo removes the active node, recover to the next sibling, previous
  sibling, visible parent, or root.

## Mutation Rules

All document mutations must go through `zod-crud`.

The showcase may keep local React state for selection, command log, render
version, and display-only clipboard preview. It must not mutate JSON directly.

## Entity Registration

The showcase registers entities with:

- `id`
- display label
- Zod schema
- initial JSON value
- child insertion keys such as `children`, `contacts`, or `tags`
- sample value factory for the add-child command
- schema source string for display

Switching entities changes the active `JsonCrud` instance and resets visible
selection to that entity root. Each registered entity owns its own editor
instance.

## Scope Boundaries

Allowed:

- a small set of registered Zod entities
- one initial JSON document per entity
- a minimal treegrid UI
- reset and add-child controls to keep the harness usable

Not allowed:

- app routing
- design/data modes
- custom design system primitives
- generated form systems
- mobile product mockups
- separate view DSLs
- schema-bound application builder logic

## Checks

The showcase must pass:

```sh
npm run typecheck -w @zod-crud/showcase
npm run build -w @zod-crud/showcase
```
