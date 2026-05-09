# zod-crud

Headless JSON CRUD, clipboard, and history primitives guarded by Zod schemas.

`zod-crud` turns nested JSON into a flat `JsonDoc` node table, lets consumers
mutate by stable `NodeId`, and commits only operations that keep the full
document valid under the root Zod schema.

```txt
nested JSON
  -> createJsonCrud(schema, initial)
  -> flat JsonDoc nodes
  -> CRUD / copy / paste / undo / redo
  -> schema-exact commit or reject
  -> nested JSON
```

## Package

The publishable package lives in `packages/zod-crud`.

```sh
npm install zod-crud zod
```

```ts
import * as z from "zod";
import { createJsonCrud } from "zod-crud";

const Schema = z.object({
  title: z.string(),
  tags: z.array(z.string()),
});

const crud = createJsonCrud(Schema, { title: "Draft", tags: [] });
const rootId = crud.snapshot().rootId;
const tagsId = crud.find(rootId, "tags");

const result = crud.create(tagsId!, 0, "docs");
if (!result.ok) {
  console.error(result.reason);
}

console.log(crud.toJson());
```

Read the package guide in `packages/zod-crud/README.md` and the behavior
contract in `packages/zod-crud/spec.md`.

## When To Use It

Use `zod-crud` when the app edits document structure, not just a single form
submission. Good fits include settings editors, nested menu builders, rule
editors, schema-aware admin tools, and treegrid JSON inspectors.

It is intentionally not a UI renderer, persistence layer, JSON Schema form
builder, or React-only state manager. Bring your own UI and storage.

## Workspaces

- `packages/zod-crud`: publishable ESM library package.
- `apps/site`: official documentation site.
- `apps/showcase`: local API playground and treegrid harness.
- `apps/nested-ui-lab`: projection lab for nested document UI experiments.

## Commands

```sh
npm run typecheck
npm test
npm run build
npm run site:build
npm run showcase:build
npm run smoke:package
npm run verify
```

Use `npm run dev` to run the documentation site locally, or
`npm run showcase:dev` for the API playground.

## Maintainer Notes

- `packages/zod-crud/spec.md` is the source of truth for package behavior.
- `packages/zod-crud/src/index.ts` is the public export surface.
- `LLMS.md` is the compact guide for LLM-assisted coding and review.
- `CONTRIBUTING.md` describes the change rules and verification checklist.
