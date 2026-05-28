import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const officialExtensions = [
  {
    root: "packages/clipboard-web",
    name: "@zod-crud/clipboard-web",
    description: /extension functions/,
    readme: [
      /createWebClipboard\(doc\)/,
      /does not add plugin registration/,
      /\{ readText, writeText \}/,
    ],
  },
  {
    root: "packages/collection",
    name: "@zod-crud/collection",
    description: /collection editing extension functions/,
    readme: [
      /createCollection\(doc\)/,
      /kanban columns, outliner rows,\s*slide rails, layer lists, admin tree sections, or spreadsheet tabs/,
      /`can\*` methods beside every edit method/,
      /does not call\s*`doc\.use\(\.\.\.\)`/,
    ],
  },
  {
    root: "packages/schema-form",
    name: "@zod-crud/schema-form",
    description: /schema-backed field descriptor extension functions/,
    readme: [
      /createSchemaForm\(doc/,
      /settings forms, generated admin resource forms,\s*document property panels, slide metadata panels, or spreadsheet tab settings/,
      /No rendered inputs, labels, layout, validation UI, focus, or keyboard policy/,
      /does not call\s*`doc\.use\(\.\.\.\)`/,
    ],
  },
  {
    root: "packages/dirty-state",
    name: "@zod-crud/dirty-state",
    description: /dirty state tracking extension functions/,
    readme: [
      /createDirtyState\(doc\)/,
      /draft editors, document\s*workbenches, generated admin forms, slide editors, spreadsheet tabs, or CMS\s*resource editors/,
      /No storage, save button, autosave, sync, conflict resolution, or UI policy/,
      /does not call\s*`doc\.use\(\.\.\.\)`/,
    ],
  },
  {
    root: "packages/bulk-edit",
    name: "@zod-crud/bulk-edit",
    description: /JSONPath bulk editing extension functions/,
    readme: [
      /createBulkEdit\(doc\)/,
      /find\/replace panels,\s*batch cleanup tools, generated admin actions, CMS\s*moderation queues, spreadsheet\s*normalizers, or kanban maintenance commands/,
      /`canReplaceAll` \/ `replaceAll`/,
      /does not call\s*`doc\.use\(\.\.\.\)`/,
    ],
  },
  {
    root: "packages/patch-log",
    name: "@zod-crud/patch-log",
    description: /patch log and replay extension functions/,
    readme: [
      /createPatchLog\(doc\)/,
      /audit mirrors,\s*replay fixtures, support repro scripts,\s*command debugging panels,\s*import dry runs, or synchronization adapters/,
      /No undo\/redo history inspection/,
      /does not call\s*`doc\.use\(\.\.\.\)`/,
    ],
  },
  {
    root: "packages/persist-web",
    name: "@zod-crud/persist-web",
    description: /web persistence extension functions/,
    readme: [
      /createDocumentPersistence\(doc/,
      /browser drafts,\s*settings editors,\s*generated admin forms,\s*CMS\s*resource editors,\s*slide editors,\s*spreadsheet tabs, or embedded workbenches/,
      /No server persistence, sync protocol, offline queue, CRDT, OT, merge, or\s*conflict resolution/,
      /does not call\s*`doc\.use\(\.\.\.\)`/,
    ],
  },
];

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function files(dir) {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return files(path);
    return entry.isFile() && path.endsWith(".ts") ? [path] : [];
  });
}

for (const extension of officialExtensions) {
  const pkg = JSON.parse(read(`${extension.root}/package.json`));
  const readme = read(`${extension.root}/README.md`);
  const label = extension.name;

  if (pkg.name !== extension.name) {
    fail(`${label}: unexpected package name.`);
  }
  if (!extension.description.test(pkg.description ?? "")) {
    fail(`${label}: description must describe an official extension.`);
  }
  if (pkg.private === true) {
    fail(`${label}: official extension packages must be publishable.`);
  }
  if (pkg.peerDependencies?.["zod-crud"] !== "^1.0.0") {
    fail(`${label}: zod-crud must stay a peer dependency.`);
  }
  if (pkg.dependencies?.["zod-crud"]) {
    fail(`${label}: zod-crud must not be a runtime dependency.`);
  }
  if (pkg.sideEffects !== false) {
    fail(`${label}: sideEffects must be false.`);
  }

  for (const sourcePath of files(`${extension.root}/src`)) {
    const source = read(sourcePath);
    for (const match of source.matchAll(/\bfrom\s+["']([^"']+)["']/g)) {
      const specifier = match[1];
      if (specifier === "zod-crud") continue;
      if (specifier.startsWith(".") && !specifier.includes("../zod-crud")) continue;
      fail(`${sourcePath}: extension source must import zod-crud only through the package entrypoint (${specifier}).`);
    }
    if (/src\/application|src\/domain|src\/foundation|\.\.\/zod-crud\/src/.test(source)) {
      fail(`${sourcePath}: extension source must not import zod-crud internals.`);
    }
    if (/doc\.use\s*\(/.test(source)) {
      fail(`${sourcePath}: extension must compose functions, not register plugins.`);
    }
  }

  for (const pattern of extension.readme) {
    if (!pattern.test(readme)) fail(`${label} README: missing ${pattern}.`);
  }
}
