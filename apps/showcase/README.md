# zod-crud JSON editor showcase

Local treegrid JSON editor harness for the `zod-crud` package.

It exists to verify that user inputs map cleanly to library operations:

- `Cmd+C`: copy selected node
- `Cmd+X`: cut selected node
- `Cmd+V`: paste into selected node
- `Delete`: delete selected node
- `Cmd+Z`: undo
- `Cmd+Shift+Z`: redo

The app intentionally avoids design-system, data-binding, and SSOT-builder
scope. It keeps a small Zod entity registry, one `JsonCrud` editor per
registered entity, treegrid selection state, command logging, clipboard display,
schema display, changed-node display from `OperationResult.changes`, and JSON
output.

Registered entities are plain objects in the showcase source:

- `id`
- label and schema name
- Zod schema
- initial JSON value
- child insertion keys
- sample value factory for Add child

Treegrid navigation:

- arrow keys move the active grid cell
- `Space` expands or collapses the active row
- `Home` and `End` move across the current row

After create, update, delete, cut, paste, undo, or redo, focus follows the
`focusNodeId` returned by `zod-crud`; the showcase does not compute the
`JsonDoc` diff itself.

The changed-node panel also reads core-provided `OperationResult.changes`
instead of diffing snapshots in the showcase.
