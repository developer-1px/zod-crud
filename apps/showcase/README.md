# zod-crud command showcase

Local keyboard-command harness for the `zod-crud` package.

It exists to verify that user inputs map cleanly to library operations:

- `Cmd+C`: copy selected node
- `Cmd+X`: cut selected node
- `Cmd+V`: paste into selected node
- `Delete`: delete selected node
- `Cmd+Z`: undo
- `Cmd+Shift+Z`: redo

The app intentionally avoids design-system, data-binding, and SSOT-builder
scope. It keeps only one recursive Zod schema, one JSON document, selection
state, command logging, a flat node table, and JSON output.
