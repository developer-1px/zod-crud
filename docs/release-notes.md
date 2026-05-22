# Release Notes

## 0.12.0 final source layout

Date: 2026-05-22

### What changed

- Public entrypoints stay at `src/index.ts` and `src/react.ts`.
- `zod-crud` remains React-free.
- `zod-crud/react` exports `useJSONDocument` from `src/react.ts` directly.
- Internal source is grouped by concept layer:
  - `application/document`: `JSONDocument` assembly, read/check/schema/clipboard/selection facades.
  - `domain/verbs`: editing verbs such as copy, cut, paste, move, duplicate, replace, find.
  - `domain/selection`, `domain/schema`, `domain/tracking`: domain rules.
  - `foundation/json-patch`, `foundation/json-pointer`, `foundation/jsonpath`: standards-backed primitives.
  - `foundation/history`, `foundation/json`, `foundation/errors`: runtime primitives.

### Public contract

No package import path changed.

```ts
import { createJSONDocument } from "zod-crud";
import { useJSONDocument } from "zod-crud/react";
```

Do not import source-layout subpaths such as `zod-crud/src/*`,
`zod-crud/dist/*`, `zod-crud/application/*`, `zod-crud/domain/*`, or
`zod-crud/foundation/*`.

### Release gate

Before release, run:

```sh
npm run verify
```

The gate includes `docs:evaluate`, package smoke tests, site docs checks, and
the release-note/source-layout drift checks.
