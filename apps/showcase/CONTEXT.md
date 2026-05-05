# Showcase Context

## Terms

- **Command matrix**: The playground surface that lists every runtime-callable
  `zod-crud` public call together with its user keymap, required input, and run
  control.
- **User command**: A user-facing action from keyboard or table UI that selects
  one `zod-crud` public call.
- **Prepared command**: Parsed and validated user drafts ready to pass to the
  public call adapter.
- **Public call adapter**: The module that executes a prepared command against
  the `zod-crud` editor without knowing keyboard or form details.
- **Docs surface**: Read-only guidance for the active command. It must not own
  execution state or keymap behavior.
