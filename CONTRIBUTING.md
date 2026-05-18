# Contributing

`zod-crud` is a Zod-guarded JSON tree library. The canonical specification
lives in `packages/zod-crud/SPEC.md`. It is locked to **RFC 6901 (JSON Pointer)**
and **RFC 6902 (JSON Patch)** for 30-year forward compatibility. SPEC.md
outranks code, docs, and tests on conflict.

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

- Read `SPEC.md` §0.1 (Absolute Principles) before any behavior change. The
  five principles (JSON-only state, RFC 6901 path, RFC 6902 op, pure core,
  React-only-in-hook) are not negotiable per-PR.
- Keep the public package surfaces in `packages/zod-crud/src/index.ts` and
  `packages/zod-crud/src/react.ts` small and intentional. They must match
  `SPEC.md` §5.
- Do not introduce convenience aliases for RFC 6902 op names (`set`, `insert`,
  `delete`, `rename`, `update`, `appendChild`, `paste` are forbidden).
- Path arguments are RFC 6901 JSON Pointer strings only. Dotted, bracket, and
  array shorthand forms are forbidden.
- Failed operations must leave state, history, and lifecycle unchanged
  (SPEC G8 atomicity).
- Behavior changes start with a SPEC.md edit (or new ADR under
  `packages/zod-crud/adr/`), then code follows.

## Pull Request Checklist

- [ ] Behavior changes are reflected in `packages/zod-crud/SPEC.md` first.
- [ ] Public API changes are reflected in `packages/zod-crud/README.md`.
- [ ] Tests cover the changed behavior and verify SPEC §7 guarantees
      (G1 serialization, G2 immutability, G3 schema-valid, G4 RFC 6902
      compatibility, G5 RFC 6901 compatibility, G6 purity, G7 history
      round-trip, G8 atomicity).
- [ ] `npm run verify` passes locally.
