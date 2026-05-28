# @zod-crud/command-state

Lab command state extension for `zod-crud` documents.

Use it to test whether command palettes, toolbar buttons, and keyboard shortcut
state can stay outside core while using the public `can*` facade.

```ts
import { createCommandState } from "@zod-crud/command-state";

const commands = createCommandState(doc);

const undo = commands.state({ id: "undo", label: "Undo" });
commands.run("replace", { path: "/title", value: "Next" });
```

## Scope

- Map common public edit methods to command ids.
- Return enabled/disabled state from `can*` results.
- Preserve disabled reasons for UI or tests.
- Execute a command only after its capability check passes.
- Let host code own labels, shortcuts, grouping, menus, and presentation.

## Non-goals

- No global command registry.
- No rendered command palette, toolbar, menu, shortcut router, keyboard policy,
  focus policy, or localization.
- No product-specific command names.
- No plugin registration; this package composes functions and does not call
  `doc.use(...)`.
- No `zod-crud` internal imports.

## Friction report

The public facade is enough for headless command state. Each command maps to an
existing public `can*` method, and execution maps to the matching public edit
method. Direct payload paste also works because `canPaste` and `paste` share the
same options shape.

This lab intentionally avoids a core command registry. Command labels,
shortcuts, grouping, and product naming are host policy.
