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
- the changed nodes returned by `zod-crud` for the last committed command

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

After a successful create, update, delete, cut, paste, undo, or redo, the active
row must follow the `focusNodeId` returned by the `zod-crud` result.

- If the operation's primary node is still live, focus that node.
- If replay inserts a subtree with no primary node, focus the inserted subtree
  root.
- If the operation changes an existing live node, focus the changed node.
- If the operation only removes nodes, recover to the next sibling, previous
  sibling, visible parent, or root.
- Ancestors of the selected result are expanded so the focused row stays
  visible.

The showcase must not compute command diffs itself. For create, update, delete,
cut, paste, undo, and redo result displays, it reads the changed-node list from
`OperationResult.changes`.

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
