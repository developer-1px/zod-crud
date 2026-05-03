# zod-crud monorepo

This repository is split into an npm library package and a small local JSON
editor showcase.

## Workspaces

- `packages/zod-crud`: publishable ESM library package.
- `apps/showcase`: Vite/React treegrid editor harness that consumes `zod-crud`.

## Commands

```sh
npm run typecheck
npm test
npm run build
npm run showcase:build
npm run smoke:package
npm run verify
```

Use `npm run dev` to run the JSON editor showcase locally.
