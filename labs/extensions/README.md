# Extension Lab

This directory is a pressure suite for `zod-crud` extensions.

Lab packages are not official public packages. They exist to test whether a FE
editing feature can be fully delegated to a headless package by composing the
public `zod-crud` document facade without adding core concepts.

Concept:

```text
app feature
└─ extension capability
   └─ zod-crud public primitives
```

An extension is a reusable headless editor capability. It is not the complete app
feature, and it is not a core primitive. The name should make the user-facing
capability obvious before someone reads the source.

The bar is delegation, not convenience. A lab is healthy when downstream app
code can call a command/capability by name and no longer knows the feature
algorithm, patch ordering, disabled reason, or atomicity rules. App-owned should
shrink to rendering, focus, current target selection, product copy/policy, and
remote/server concerns.

Naming test:

- The package name should be a familiar command or feature name: something a
  developer could put in a command palette, toolbar, menu, or docs heading and
  expect editor users to recognize.
- The package must fit: `Use @zod-crud/<name> to <known editor capability>.`
- Prefer frequently used de-facto editor terms over internal implementation
  terms. A commonly called command name is better than a technically precise
  but unfamiliar library word.
- Prefer names like `clear-contents`, `fill-series`, `remove-duplicates`,
  `paste-special`, `change-case`, `grouping`, `bookmarks`, `autosave`, and
  `live-cursors`.
- Avoid names that only describe an internal mechanism or pressure test.
- Avoid names like `convert-type`, `ensure-*`, `*-kind`, `toggle-option`, and generic
  words such as `limit` unless the surrounding phrase makes the command obvious.
- If the name cannot explain what a downstream editor can build with it, keep it
  lab-only or rename it before promotion.
- Do not keep convenience wrappers as packages. If core public APIs already make
  a helper straightforward, document it as a recipe instead of preserving a lab
  package.

Rules:

- Import `zod-crud` only through the public package entrypoint.
- Do not import `packages/zod-crud/src/**`.
- Do not add `doc.use(...)`, plugin registration, or global mutation.
- Keep every lab package `private: true`.
- In the package README, keep `Scope`, `Non-goals`, and `Friction report`
  sections.

Duplication policy:

- Keep feature-local result helpers local while the package is in lab.
- Do not add a shared lab utility package just to remove repeated
  `capabilityError`, `patchError`, `error`, or `cloneJson` helpers.
- Record repeated product-neutral constraints in
  `docs/standard/contract-pressure-register.md`.
- Extract only when several independent packages repeat the same lower-level
  concept, not merely the same helper shape.

Escalation strategy:

- Start every new editor feature in `labs/extensions`.
- Keep lab packages small and centered on one feature vocabulary.
- Dogfood the package in an app or focused lab before promotion.
- Promote to `packages/*` only after repeated evidence shows a stable feature
  boundary.
- Promote to `packages/zod-crud` core last, only when several extensions are
  recreating the same product-neutral primitive.

Promotion path:

1. A lab package proves a distinct responsibility.
2. Its source passes `npm run labs:extensions:verify`.
3. Its name passes the capability promise test without relying on implementation
   details.
4. The friction report separates local boilerplate from actual core pressure.
5. Promotion evidence shows app concept code disappeared, not just that a helper
   became reusable.
6. Only then move it from `labs/extensions/*` to `packages/*`.

Current labs are listed in the generated catalog:
`docs/generated/extensions-catalog.md`.
