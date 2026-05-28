# @zod-crud/selection-model

Lab extension for treating document selection as an app-level selection model.

```ts
const selection = createSelectionModel(doc);

selection.selectMany(["/cards/0", "/cards/1"]);
selection.current().values;
```

## Status

Private lab package. Not part of the official public API.

## Public API Pressure

- Uses only `doc.selection`, `doc.at`, and selection facade methods.
- App-level row/card selection can remain outside core when pointers are enough.
- The extension stays headless and does not introduce UI or focus concepts into core.

## Friction

- Pointer-based selection works, but stable row identity still needs a separate index extension.
- Selection disabled state must be handled by every consumer that wants optional selection.
