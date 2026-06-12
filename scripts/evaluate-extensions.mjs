import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const officialExtensions = [
  {
    root: "packages/clipboard-web",
    name: "@interactive-os/json-document-clipboard-web",
    description: /extension functions/,
    readme: [
      /createWebClipboard\(doc\)/,
      /does not add plugin registration/,
      /\{ readText, writeText \}/,
    ],
  },
  {
    root: "packages/collection",
    name: "@interactive-os/json-document-collection",
    description: /collection editing extension functions/,
    readme: [
      /createCollection\(doc\)/,
      /kanban columns, outliner rows,\s*slide rails, layer lists, admin tree sections, or spreadsheet tabs/,
      /`can\*` methods beside every edit method/,
      /does not call\s*`doc\.use\(\.\.\.\)`/,
    ],
  },
  {
    root: "packages/outline",
    name: "@interactive-os/json-document-outline",
    description: /outline tree and structure editing extension functions/,
    readme: [
      /createOutline\(doc\)/,
      /outliners, Markdown list editors,\s*document block trees, note outlines, or generated content review tools/,
      /Demote one or more outline items under their previous sibling/,
      /No Markdown parser, rich text formatting, renderer, DOM selection, focus,/,
      /No default row factory and no insert-sibling\/insert-child policy/,
      /does not call\s*`doc\.use\(\.\.\.\)`/,
    ],
  },
  {
    root: "packages/schema-form",
    name: "@interactive-os/json-document-schema-form",
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
    name: "@interactive-os/json-document-dirty-state",
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
    name: "@interactive-os/json-document-bulk-edit",
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
    name: "@interactive-os/json-document-patch-log",
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
    name: "@interactive-os/json-document-persist-web",
    description: /web persistence extension functions/,
    readme: [
      /createDocumentPersistence\(doc/,
      /browser drafts,\s*settings editors,\s*generated admin forms,\s*CMS\s*resource editors,\s*slide editors,\s*spreadsheet tabs, or embedded workbenches/,
      /No server persistence, sync protocol, offline queue, CRDT, OT, merge, or\s*conflict resolution/,
      /does not call\s*`doc\.use\(\.\.\.\)`/,
    ],
  },
  {
    root: "packages/id-resolver",
    name: "@interactive-os/json-document-id-resolver",
    description: /stable id resolver extension functions/,
    readme: [
      /createIdResolver\(doc/,
      /kanban cards,\s*form fields,\s*slide objects,\s*diagram nodes,\s*review comments,\s*layer panels,\s*or imported rows/,
      /Resolve a registered `scope` and stable `id` to the current JSON Pointer/,
      /No id generation, id rekeying, uniqueness repair, or server identity policy/,
      /does not call\s*`doc\.use\(\.\.\.\)`/,
    ],
  },
  {
    root: "packages/patch-preview",
    name: "@interactive-os/json-document-patch-preview",
    description: /patch preview extension functions/,
    readme: [
      /createPatchPreview\(Schema, doc\)/,
      /import review,\s*find\/replace confirmation,\s*AI proposed changes,\s*bulk cleanup,\s*dry-run save checks,\s*or admin moderation/,
      /Compute a next JSON document value without mutating the document/,
      /No visual diff rendering, confirmation UI, review workflow/,
      /does not call\s*`doc\.use\(\.\.\.\)`/,
    ],
  },
  {
    root: "packages/search-replace",
    name: "@interactive-os/json-document-search-replace",
    description: /search and replace extension functions/,
    readme: [
      /createSearchReplace\(doc\)/,
      /block documents,\s*CMS copy review,\s*generated admin editors,\s*slide notes,\s*import cleanup,\s*or settings search/,
      /Find occurrences inside string values/,
      /Regex replace-all remains host-owned/,
      /No rendered text extraction from Markdown,\s*HTML,\s*ProseMirror,\s*canvas text,\s*or\s*custom rich text formats/,
      /does not call\s*`doc\.use\(\.\.\.\)`/,
    ],
  },
  {
    root: "packages/proposed-changes",
    name: "@interactive-os/json-document-proposed-changes",
    description: /proposed document change review extension functions/,
    readme: [
      /createProposedChanges\(doc\)/,
      /AI edits,\s*import review,\s*moderation queues,\s*CMS copy review,\s*generated admin\s*approval,\s*or document cleanup suggestions/,
      /detect stale changes by comparing guarded target values/,
      /autocomplete, mention, or slash-command surfaces/,
      /does not call\s*`doc\.use\(\.\.\.\)`/,
    ],
  },
  {
    root: "packages/comments",
    name: "@interactive-os/json-document-comments",
    description: /comments extension functions/,
    readme: [
      /createComments\(doc\)/,
      /block documents,\s*CMS review,\s*slide\/object notes,\s*import review,\s*moderation queues,\s*or\s*generated admin editors/,
      /Track anchors through document edits with `doc\.subscribe/,
      /No rendered comment UI, thread layout, popovers, highlighting, keyboard, or\s*focus policy/,
      /does not call\s*`doc\.use\(\.\.\.\)`/,
    ],
  },
  {
    root: "packages/form-draft",
    name: "@interactive-os/json-document-form-draft",
    description: /form draft extension functions/,
    readme: [
      /createFormDraft\(doc/,
      /form,\s*property panel,\s*settings,\s*CMS,\s*generated admin,\s*spreadsheet cell,\s*or import mapping inputs/,
      /Preflight commits with `doc\.canReplace`/,
      /No rendered input, label, layout, keyboard, focus, IME, masking, or debounce\s*policy/,
      /does not call\s*`doc\.use\(\.\.\.\)`/,
    ],
  },
  {
    root: "packages/protected-ranges",
    name: "@interactive-os/json-document-protected-ranges",
    description: /protected range guard extension functions/,
    readme: [
      /createProtectedRanges\(doc/,
      /published fields,\s*legal copy,\s*locked\s*settings,\s*import targets,\s*generated sections,\s*or moderated content/,
      /Guard direct document edits before calling public `@interactive-os/json-document` operations/,
      /No UI lock icons, focus handling, keyboard policy, or permissions dialog/,
      /does not call\s*`doc\.use\(\.\.\.\)`/,
    ],
  },
  {
    root: "packages/snippets",
    name: "@interactive-os/json-document-snippets",
    description: /snippet insertion extension functions/,
    readme: [
      /createSnippets\(doc/,
      /block editors,\s*CMS sections,\s*kanban cards,\s*form fields,\s*generated admin templates,\s*slide objects,\s*or import presets/,
      /Insert a snippet payload with `canPaste` \/ `paste`/,
      /No slash command UI, palette, menu, editor toolbar, or search ranking/,
      /does not call\s*`doc\.use\(\.\.\.\)`/,
    ],
  },
];
const sourceAliasHelper = read("config/json-document-source-aliases.ts");
const tsconfigPaths = JSON.parse(read("tsconfig.json-document-paths.json"));
const outlinerVitestConfig = read("apps/outliner/vitest.config.ts");
const siteViteConfig = read("apps/site/vite.config.ts");

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

function packageDirs(dir) {
  return readdirSync(join(root, dir), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `${dir}/${entry.name}`)
    .filter((path) => readJsonIfExists(`${path}/package.json`) !== null)
    .sort();
}

function readJsonIfExists(path) {
  if (!existsSync(join(root, path))) return null;
  return JSON.parse(read(path));
}

const officialExtensionRoots = new Set(officialExtensions.map((extension) => extension.root));
for (const dir of packageDirs("packages")) {
  const pkg = readJsonIfExists(`${dir}/package.json`);
  if (pkg?.name === "@interactive-os/json-document") continue;
  if (!officialExtensionRoots.has(dir)) {
    fail(`${dir}: official extension package is missing from scripts/evaluate-extensions.mjs metadata.`);
  }
}

const tsconfigPathAliases = tsconfigPaths.compilerOptions?.paths ?? {};
if (!tsconfigPathAliases["@interactive-os/json-document-*"]?.includes("packages/*/src/index.ts")) {
  fail("tsconfig.json-document-paths.json: missing package wildcard source path.");
}
if (!tsconfigPathAliases["@interactive-os/json-document-*"]?.includes("labs/extensions/*/src/index.ts")) {
  fail("tsconfig.json-document-paths.json: missing lab extension wildcard source path.");
}
if (tsconfigPathAliases["@interactive-os/json-document/react"]?.[0] !== "packages/json-document/src/react.ts") {
  fail("tsconfig.json-document-paths.json: missing @interactive-os/json-document/react source path.");
}
if (tsconfigPathAliases["@interactive-os/json-document"]?.[0] !== "packages/json-document/src/index.ts") {
  fail("tsconfig.json-document-paths.json: missing json-document source path.");
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
  if (pkg.peerDependencies?.["@interactive-os/json-document"] !== "^1.0.0") {
    fail(`${label}: json-document must stay a peer dependency.`);
  }
  if (pkg.dependencies?.["@interactive-os/json-document"]) {
    fail(`${label}: json-document must not be a runtime dependency.`);
  }
  if (pkg.sideEffects !== false) {
    fail(`${label}: sideEffects must be false.`);
  }

  for (const sourcePath of files(`${extension.root}/src`)) {
    const source = read(sourcePath);
    for (const match of source.matchAll(/\bfrom\s+["']([^"']+)["']/g)) {
      const specifier = match[1];
      if (specifier === "@interactive-os/json-document") continue;
      if (specifier.startsWith(".") && !specifier.includes("../json-document")) continue;
      fail(`${sourcePath}: extension source must import json-document only through the package entrypoint (${specifier}).`);
    }
    if (/src\/application|src\/domain|src\/foundation|\.\.\/json-document\/src/.test(source)) {
      fail(`${sourcePath}: extension source must not import json-document internals.`);
    }
    if (/doc\.use\s*\(/.test(source)) {
      fail(`${sourcePath}: extension must compose functions, not register plugins.`);
    }
  }

  for (const pattern of extension.readme) {
    if (!pattern.test(readme)) fail(`${label} README: missing ${pattern}.`);
  }

  const packageName = extension.name.replace("@interactive-os/json-document-", "");
  if (!sourceAliasHelper.includes(`"${packageName}"`)) {
    fail(`${label}: missing from shared source alias helper.`);
  }
}

for (const [label, source] of [
  ["apps/outliner/vitest.config.ts", outlinerVitestConfig],
  ["apps/site/vite.config.ts", siteViteConfig],
]) {
  if (!source.includes("jsonDocumentSourceAliases({ officialExtensions: true })")) {
    fail(`${label}: official extension aliases must use the shared helper.`);
  }
}

for (const tsconfigPath of packageDirs("apps").map((dir) => `${dir}/tsconfig.json`)) {
  const tsconfig = readJsonIfExists(tsconfigPath);
  if (tsconfig?.extends !== "../../tsconfig.json-document-paths.json") {
    fail(`${tsconfigPath}: must extend shared json-document paths.`);
  }
  const paths = tsconfig?.compilerOptions?.paths;
  if (paths !== undefined) {
    fail(`${tsconfigPath}: must not duplicate json-document source paths.`);
  }
}

for (const configPath of files("apps").filter((path) => /vite(?:st)?\.config\.ts$/.test(path))) {
  const source = read(configPath);
  if (/\.\.\/\.\.\/(?:packages|labs\/extensions)\//.test(source)) {
    fail(`${configPath}: json-document source aliases must use config/json-document-source-aliases.ts.`);
  }
}
