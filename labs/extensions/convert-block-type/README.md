# @interactive-os/json-document-convert-block-type

Lab extension for converting a JSON block/object from one host-described type to
another.

This package is for structural editor features such as block type conversion,
content type conversion, or object type conversion. It does not know product
nouns like Notion block, CMS entry, slide object, or component.

## Scope

- read the source block/object through `doc.at(pointer)`
- let the host read the current type
- let the host create the converted value
- validate the replacement through `doc.canPatch`
- apply the replacement through `doc.patch`
- return structured `can*` and execution errors

## Non-goals

- schema introspection
- UI menu or command palette
- product-specific type names
- field preservation policy
- child/layout semantics
- ID remapping policy

```ts
const converter = createBlockTypeConverter(doc, {
  targetTypes: ["paragraph", "heading", "todo"],
  readType: (value) => isRecord(value) && typeof value.kind === "string"
    ? value.kind
    : undefined,
  createValue: ({ value, to }) => ({
    ...pickSharedFields(value),
    kind: to,
  }),
});

if (converter.canConvert({ pointer: "/blocks/0", to: "heading" }).ok) {
  converter.convert({ pointer: "/blocks/0", to: "heading" });
}
```

## Friction report

- Core `at`, `canPatch`, and `patch` are enough for a first block type
  conversion engine.
- Schema introspection is not enough by itself because field preservation,
  child retention, and default values are product policy.
- No core change is recommended yet. If more structural packages repeat
  `readType` + `targetTypes` + `createValue`, a reusable type descriptor may
  become a candidate.
