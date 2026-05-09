# Contributing

`zod-crud` is a small TypeScript library for schema-guarded JSON document
editing. The package contract lives in `packages/zod-crud/spec.md`; update the
spec first when behavior is new, debatable, or intentionally changed.

## Local Setup

```sh
npm install
npm run verify
```

Useful focused checks:

```sh
npm run typecheck -w zod-crud
npm test -w zod-crud
npm run build -w zod-crud
npm run smoke:package -w zod-crud
npm run site:build
```

## Change Rules

- Keep the public package surface in `packages/zod-crud/src/index.ts` small and
  intentional.
- Do not mutate `JsonDoc` directly in examples or apps; route document changes
  through `createJsonCrud` operations.
- Failed operations must leave document state, history, clipboard, and id
  allocation unchanged.
- Add or update tests for schema traversal, clipboard/history, focus results,
  changed-node metadata, package exports, or any public behavior change.
- Keep package docs and `spec.md` aligned. If code and docs disagree, the spec
  is the source of truth until deliberately changed.

## Pull Request Checklist

- [ ] Behavior changes are described in `packages/zod-crud/spec.md`.
- [ ] Public API changes are reflected in `packages/zod-crud/README.md` and
      `packages/zod-crud/LLMS.md`.
- [ ] Tests cover the changed behavior.
- [ ] `npm run verify` passes locally.
