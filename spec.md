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

## Mutation Rules

All document mutations must go through `zod-crud`.

The showcase may keep local React state for selection, command log, render
version, and display-only clipboard preview. It must not mutate JSON directly.

## Scope Boundaries

Allowed:

- one recursive Zod schema
- one initial JSON document
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
