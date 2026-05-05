# zod-crud API playground

Local JSON tree playground for exercising every runtime-callable `zod-crud`
API.

The app is intentionally a test bench, not a product demo. It keeps the
`JsonDoc` tree as the primary surface because most editor APIs operate on
`nodeId`, `JsonPath`, selected node ids, `OperationResult`, and changed nodes.

## Surfaces

- API sidebar: all runtime-callable APIs grouped by factory, document, read,
  mutation, clipboard, capability, history, and subscription.
- JsonDoc tree: node id based treegrid with single, toggle, and range
  multi-selection.
- Workbench: selected API inputs, primitive update validation preview, last
  result, selected ids, subscription count, and current `toJson()` output.

## Scope

Included:

- `createJsonCrud` through preset schema/editor reset.
- Top-level document APIs: `serialize`, `deserialize`, `getPath`.
- Editor read, mutation, clipboard, capability, history, and subscription APIs.
- Separate `*Many` API entries instead of hiding them behind selection facades.
- Primitive value update preview and commit result messages.

Excluded for now:

- Runtime Zod code entry.
- Schema builder UI.
- Object/array subtree replacement UI.
- Admin dashboard or product workflow demo.
