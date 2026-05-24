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

## 0.12.0 production API lock

Date: 2026-05-24

### What changed

- Root type exports now include the support types visible through the public
  `JSONDocument` facade: document options, read/schema/clipboard results,
  selection options/results, and copy/cut/duplicate/paste result types.
- Runtime entrypoints remain unchanged: `zod-crud` and `zod-crud/react`.
- `doc.ops`, `doc.commands`, `doc.check`, and `doc.can` namespaces remain
  outside the production root contract. Consumers should use local adapters if
  they need those names.

### Release gate

`npm run verify` and package tarball smoke must pass before publishing.

## 1.0 readiness release gate

Date: 2026-05-24

### What changed

- Added a root `release:check` script as the final local gate.
- The gate runs `verify`, `perf:core`, and `pack:library` so package checks,
  docs drift checks, browser demo smoke, performance measurement, and tarball
  creation are not tracked as separate pre-release memory items.
- Public export names are locked in `packages/zod-crud/public-contract.json`,
  which package smoke tests, docs consistency tests, and docs evaluation read as
  the contract SSOT.
- Package `prepublishOnly` delegates to the root `release:check`, so manual
  publish attempts cannot bypass docs, browser, performance, or pack gates.

### Release gate

Before publishing 1.0, run:

```sh
npm run release:check
```

## 1.0.0 package version

Date: 2026-05-24

### What changed

- Package version is now `1.0.0`.
- The 1.0 package version is release-gated by the same root `release:check`
  path used by `prepublishOnly`.

### Release gate

Before publishing 1.0.0, run:

```sh
npm run release:check
```

## 1.0 external gap classification

Date: 2026-05-24

### What changed

- `docs/api-usage-gaps.md` no longer classifies legacy `doc.ops` or
  `doc.commands` expectations as zod-crud 1.0 root-contract blockers.
- Those names remain external adapter and migration issues for consumers that
  still need them.
- `docs:evaluate` and docs consistency tests now reject unresolved `P0` wording
  in the API gap ledger.
- Remaining external-usage priorities are documented as post-1.0 adoption work,
  not package release blockers.

### Release decision

- Keep `doc.ops` and `doc.commands` outside the production root contract.
- Ship the 1.0 package with the locked root and `zod-crud/react` public
  contract.
