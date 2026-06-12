import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const check = process.argv.includes("--check");

const outputs = [
  ["docs/generated/repo-catalog.json", () => `${JSON.stringify(repoCatalog(), null, 2)}\n`],
  ["docs/generated/extensions-catalog.md", () => renderExtensionsCatalog(repoCatalog())],
  ["apps/site/src/generated/repo-catalog.ts", () => renderSiteCatalog(repoCatalog())],
];

let cachedRepoCatalog = null;
function repoCatalog() {
  cachedRepoCatalog ??= createRepoCatalog();
  return cachedRepoCatalog;
}

const extensionGuidance = {
  "@interactive-os/json-document-autosave": {
    useFor: "schedule host-owned saves after document changes",
    notFor: "retry queues, offline sync, or server conflict resolution",
  },
  "@interactive-os/json-document-batch-update": {
    useFor: "set a field across a list of selected item pointers to a constant or computed value",
    notFor: "selecting which items to edit, or JSONPath query-driven replacement",
  },
  "@interactive-os/json-document-bookmarks": {
    useFor: "keep named JSON Pointer locations stable across edits",
    notFor: "browser bookmarks or route state",
  },
  "@interactive-os/json-document-bulk-edit": {
    useFor: "apply JSONPath replace/delete operations to many document positions",
    notFor: "rendered text search UI or product workflow approval",
  },
  "@interactive-os/json-document-checkpoints": {
    useFor: "name and restore document snapshots",
    notFor: "durable version graphs or cloud backup",
  },
  "@interactive-os/json-document-clear-contents": {
    useFor: "reset selected fields to schema-derived empty values, keeping structure",
    notFor: "structural delete, caller-supplied bulk replace, or enum/object default policy",
  },
  "@interactive-os/json-document-clipboard-web": {
    useFor: "bridge json-document clipboard payloads to the browser clipboard",
    notFor: "TSV/CSV spreadsheet paste engines",
  },
  "@interactive-os/json-document-convert-type": {
    useFor: "convert a field type (string/number/integer/boolean) where the schema permits it",
    notFor: "locale/format-aware parsing of currency or dates, or input masks",
  },
  "@interactive-os/json-document-collection": {
    useFor: "edit ordered JSON arrays with item-level commands",
    notFor: "database collections or rendered list UI",
  },
  "@interactive-os/json-document-id-resolver": {
    useFor: "resolve scoped stable ids to current JSON Pointers",
    notFor: "id generation, relation graphs, routing, or server identity",
  },
  "@interactive-os/json-document-toggle-value": {
    useFor: "toggle a boolean or advance an enum/value field (enum options come from the schema)",
    notFor: "rendered toggle controls or keyboard policy",
  },
  "@interactive-os/json-document-sort-items": {
    useFor: "sort or reverse JSON array items",
    notFor: "query views, filters, or server sorting",
  },
  "@interactive-os/json-document-comments": {
    useFor: "anchor review comments to document structure",
    notFor: "comment UI, moderation, or author storage",
  },
  "@interactive-os/json-document-calculated-fields": {
    useFor: "sync host-computed derived JSON fields",
    notFor: "formula languages or dependency runtimes",
  },
  "@interactive-os/json-document-convert-block-type": {
    useFor: "convert selected nodes between host-described kinds",
    notFor: "schema migration systems",
  },
  "@interactive-os/json-document-dedupe": {
    useFor: "remove duplicate array items by whole value or a host key",
    notFor: "fuzzy matching, cross-array dedupe, or JSONPath match deletion",
  },
  "@interactive-os/json-document-dirty-state": {
    useFor: "compare a document to a clean baseline",
    notFor: "persistence or server save status",
  },
  "@interactive-os/json-document-document-diff": {
    useFor: "produce and apply patch changes toward a target document",
    notFor: "visual diff UI or merge conflict resolution",
  },
  "@interactive-os/json-document-drag-drop": {
    useFor: "turn drag/drop intent into move or paste operations",
    notFor: "DOM drag/drop events, hit testing, or hover UI",
  },
  "@interactive-os/json-document-apply-defaults": {
    useFor: "add missing object keys from a defaults map without overwriting existing ones",
    notFor: "filling existing empty values, removing unknown keys, or deep merge",
  },
  "@interactive-os/json-document-fill-blanks": {
    useFor: "fill only empty slots across targets, preserving non-empty values",
    notFor: "adding missing fields, choosing targets, or unconditional batch set",
  },
  "@interactive-os/json-document-fill-series": {
    useFor: "fill a value or linear series across a contiguous sibling range",
    notFor: "date/pattern series, 2D grid fill, or fill-handle drag UI",
  },
  "@interactive-os/json-document-form-draft": {
    useFor: "hold temporary invalid form input before committing valid JSON",
    notFor: "rendered form components",
  },
  "@interactive-os/json-document-fill-down": {
    useFor: "carry the last non-empty value into the empty slots that follow (ffill)",
    notFor: "constant fill, numeric series interpolation, or rendered grid UI",
  },
  "@interactive-os/json-document-paste-cells": {
    useFor: "paste a 2D value matrix onto a rectangular array-of-records region",
    notFor: "TSV/CSV parsing, clipboard I/O, or auto-growing the array",
  },
  "@interactive-os/json-document-grid-range": {
    useFor: "paste or fill rectangular grid ranges backed by sparse JSON records",
    notFor: "DOM grid selection, coordinate naming policy, formulas, or TSV/CSV parsing",
  },
  "@interactive-os/json-document-grouping": {
    useFor: "group and ungroup selected sibling JSON items",
    notFor: "Airtable group-by views",
  },
  "@interactive-os/json-document-limit-items": {
    useFor: "cap a JSON array to at most N items, keeping the start or end",
    notFor: "choosing survivors beyond start/end, or auto-trimming on insert",
  },
  "@interactive-os/json-document-move-selected": {
    useFor: "move a contiguous selection of sibling items to a new position",
    notFor: "single-item moves, drag/drop events, or cross-array moves",
  },
  "@interactive-os/json-document-join-text": {
    useFor: "join an array into a string field with a separator (inverse of split-text)",
    notFor: "locale list formatting, or reading the result without writing",
  },
  "@interactive-os/json-document-layer-order": {
    useFor: "reorder visual stack arrays with bring/send commands",
    notFor: "canvas rendering or z-index CSS management",
  },
  "@interactive-os/json-document-increment-number": {
    useFor: "increment, decrement, or step a numeric field with optional clamping",
    notFor: "rendered spinners, formatting, units, or currency",
  },
  "@interactive-os/json-document-outline": {
    useFor: "project and edit nested document outline structures",
    notFor: "Figma layer panels without a tree schema adapter",
  },
  "@interactive-os/json-document-paste-special": {
    useFor: "adapt external payloads before schema-safe paste",
    notFor: "browser clipboard I/O or autocomplete dropdowns",
  },
  "@interactive-os/json-document-pad-text": {
    useFor: "pad a string field to a minimum length (zero-padded codes/IDs)",
    notFor: "number formatting or display-time alignment",
  },
  "@interactive-os/json-document-patch-log": {
    useFor: "record and replay applied JSON Patch records",
    notFor: "product activity feeds or audit authorization",
  },
  "@interactive-os/json-document-patch-preview": {
    useFor: "preview patch effects before confirmation",
    notFor: "visual diff rendering",
  },
  "@interactive-os/json-document-persist-web": {
    useFor: "save and restore documents in browser storage-like hosts",
    notFor: "server sync, auth, or conflict resolution",
  },
  "@interactive-os/json-document-live-cursors": {
    useFor: "track remote collaborator cursors and selections",
    notFor: "CRDT/OT or realtime transport",
  },
  "@interactive-os/json-document-proposed-changes": {
    useFor: "review, accept, or reject proposed document patches",
    notFor: "slash commands or mention autocomplete",
  },
  "@interactive-os/json-document-protected-ranges": {
    useFor: "guard edits to protected JSON Pointer ranges",
    notFor: "2D spreadsheet selection UI or server authorization",
  },
  "@interactive-os/json-document-renumber-items": {
    useFor: "sync an order/position field to each item array position after a reorder",
    notFor: "reordering the array itself, or fractional/gap indexing",
  },
  "@interactive-os/json-document-references": {
    useFor: "track stable references and backlinks over JSON documents",
    notFor: "route state or rendered links",
  },
  "@interactive-os/json-document-schema-form": {
    useFor: "derive schema-backed field descriptors",
    notFor: "form rendering or input widgets",
  },
  "@interactive-os/json-document-round": {
    useFor: "round a number to a precision or nearest step (round/floor/ceil/trunc)",
    notFor: "currency/locale formatting, or increment/clamp (see increment-number)",
  },
  "@interactive-os/json-document-search-replace": {
    useFor: "find and replace text across document string fields",
    notFor: "regex engines, rendered text extraction, or search UI",
  },
  "@interactive-os/json-document-swap-items": {
    useFor: "exchange the positions of two items in the same array",
    notFor: "cross-array swaps or moving to an arbitrary index",
  },
  "@interactive-os/json-document-trim-text": {
    useFor: "cap a string field to a max length with optional ellipsis and word boundary",
    notFor: "display-time CSS truncation or grapheme/locale-aware length",
  },
  "@interactive-os/json-document-change-case": {
    useFor: "apply case/whitespace transforms (upper, lower, trim, title) to a string field",
    notFor: "locale-aware casing, rich text formatting toolbars, or find/replace",
  },
  "@interactive-os/json-document-split-text": {
    useFor: "split a string into array items by a delimiter (tag input, paste-as-list)",
    notFor: "CSV/TSV quoting, split-to-columns, or clipboard access",
  },
  "@interactive-os/json-document-sparse-record": {
    useFor: "set or remove keyed entries in sparse JSON records with add/replace/remove/no-op planning",
    notFor: "2D grid coordinate expansion, product key normalization, or rendered selection",
  },
  "@interactive-os/json-document-toggle-option": {
    useFor: "toggle, add, or remove a value's presence in a JSON array (tag/multi-select)",
    notFor: "ordered insertion position or deduping an existing array",
  },
  "@interactive-os/json-document-generate-slug": {
    useFor: "derive a URL-safe slug from a string field (CMS title to slug)",
    notFor: "uniqueness/collision handling or non-Latin transliteration",
  },
  "@interactive-os/json-document-snippets": {
    useFor: "insert reusable JSON payloads with schema-safe paste checks",
    notFor: "slash palette UI or snippet storage",
  },
  "@interactive-os/json-document-wrap-selection": {
    useFor: "wrap sibling JSON items in host-defined containers",
    notFor: "visual grouping or layout containers",
  },
};

const stale = [];
for (const [path, build] of outputs) {
  const next = build();
  const absolute = join(root, path);
  const current = existsSync(absolute) ? readFileSync(absolute, "utf8") : null;

  if (check) {
    if (current !== next) stale.push(path);
    continue;
  }

  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, next);
}

if (stale.length > 0) {
  console.error(`Generated docs are stale. Run npm run docs:generate.\n${stale.map((path) => `- ${path}`).join("\n")}`);
  process.exitCode = 1;
} else if (check) {
  console.log("generated docs ok");
} else {
  console.log("generated docs updated");
}

function createRepoCatalog() {
  const packages = packageEntries("packages").map((entry) =>
    packageDoc(entry.path, entry.name === "json-document" ? "core" : "official-extension"),
  );
  const labExtensions = packageEntries("labs/extensions").map((entry) =>
    packageDoc(entry.path, "lab-extension"),
  );
  const apps = packageEntries("apps").map((entry) => packageDoc(entry.path, "app"));
  const rootPackage = readJson("package.json");
  const readme = readIfExists("README.md");
  assertCompleteExtensionGuidance([
    ...packages.filter((item) => item.status === "official-extension"),
    ...labExtensions,
  ]);

  return {
    schemaVersion: 1,
    repo: {
      name: rootPackage.name,
      private: rootPackage.private === true,
      summary: summaryFromReadme(readme),
    },
    packages: packages.sort(byPath),
    officialExtensions: packages
      .filter((item) => item.status === "official-extension")
      .sort(byName),
    labExtensions: labExtensions.sort(byName),
    apps: apps.sort(byName),
    totals: {
      packages: packages.length,
      officialExtensions: packages.filter((item) => item.status === "official-extension").length,
      labExtensions: labExtensions.length,
      apps: apps.length,
    },
  };
}

function assertCompleteExtensionGuidance(extensionItems) {
  const extensionNames = new Set(extensionItems.map((item) => item.name));
  const missing = [...extensionNames].filter((name) => extensionGuidance[name] === undefined);
  const stale = Object.keys(extensionGuidance).filter((name) => !extensionNames.has(name));

  if (missing.length > 0 || stale.length > 0) {
    throw new Error([
      "Extension guidance metadata is out of sync.",
      ...missing.map((name) => `missing guidance: ${name}`),
      ...stale.map((name) => `stale guidance: ${name}`),
    ].join("\n"));
  }
}

function packageEntries(dir) {
  const absolute = join(root, dir);
  if (!existsSync(absolute)) return [];
  return readdirSync(absolute, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(absolute, entry.name, "package.json")))
    .map((entry) => ({
      name: entry.name,
      path: `${dir}/${entry.name}`,
    }));
}

function packageDoc(path, status) {
  const pkg = readJson(`${path}/package.json`);
  const readme = readIfExists(`${path}/README.md`);
  const sourcePath = `${path}/src/index.ts`;
  const source = readIfExists(sourcePath);
  const publicExports = extractExports(source);

  return {
    path,
    name: stringValue(pkg.name),
    status,
    private: pkg.private === true,
    publishable: pkg.private !== true,
    version: stringValue(pkg.version),
    description: stringValue(pkg.description),
    license: stringValue(pkg.license),
    summary: summaryFromReadme(readme) ?? stringValue(pkg.description),
    guidance: extensionGuidance[pkg.name] ?? null,
    publicExports,
    publicExportCount: publicExports.length,
    keywords: Array.isArray(pkg.keywords) ? pkg.keywords.filter((item) => typeof item === "string").sort() : [],
  };
}

function readJson(path) {
  return JSON.parse(read(path));
}

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

function readIfExists(path) {
  const absolute = join(root, path);
  return existsSync(absolute) ? readFileSync(absolute, "utf8") : "";
}

function stringValue(value) {
  return typeof value === "string" ? value : null;
}

function byName(a, b) {
  return a.name.localeCompare(b.name);
}

function byPath(a, b) {
  return a.path.localeCompare(b.path);
}

function summaryFromReadme(readme) {
  return readme
    .split(/\n\n+/)
    .map((block) => block.trim())
    .find((block) =>
      block
      && !block.startsWith("#")
      && !block.startsWith("```")
      && !block.startsWith("|")
      && !block.startsWith("- "),
    ) ?? null;
}

function extractExports(source) {
  const names = new Set();

  for (const match of source.matchAll(/export\s+(?:type\s+)?\{([\s\S]*?)\}/g)) {
    for (const raw of match[1].split(",")) {
      const name = raw.trim().split(/\s+as\s+/).pop()?.trim();
      if (name) names.add(name);
    }
  }

  for (const match of source.matchAll(/export\s+(?:declare\s+)?(?:async\s+)?(?:function|interface|type|const|class|enum)\s+([A-Za-z_$][\w$]*)\b/g)) {
    names.add(match[1]);
  }

  return [...names].sort();
}

function renderExtensionsCatalog(catalog) {
  return [
    "<!-- Generated by scripts/generate-docs.mjs. Do not edit directly. -->",
    "",
    "## Generated extension catalog",
    "",
    "This section is generated from `packages/*` and `labs/extensions/*`.",
    "",
    `Official extensions: ${catalog.totals.officialExtensions}`,
    "",
    "| Package | Exports | Use for | Not for | Summary |",
    "| --- | ---: | --- | --- | --- |",
    ...catalog.officialExtensions.map((item) =>
      extensionCatalogRow(item),
    ),
    "",
    `Lab extensions: ${catalog.totals.labExtensions}`,
    "",
    "Lab extensions are private candidates. They are listed to show product pressure, not as shipped packages.",
    "",
    "| Package | Status | Exports | Use for | Not for | Summary |",
    "| --- | --- | ---: | --- | --- | --- |",
    ...catalog.labExtensions.map((item) =>
      extensionCatalogRow(item),
    ),
    "",
  ].join("\n");
}

function extensionCatalogRow(item) {
  const guidance = item.guidance ?? {};
  const cells = [
    `\`${item.name}\``,
    item.status === "lab-extension" ? "lab-only" : null,
    item.publicExportCount,
    escapeMarkdownCell(guidance.useFor ?? ""),
    escapeMarkdownCell(guidance.notFor ?? ""),
    escapeMarkdownCell(item.summary ?? item.description ?? ""),
  ].filter((cell) => cell !== null);

  return `| ${cells.join(" | ")} |`;
}

function renderSiteCatalog(catalog) {
  return [
    "// Generated by scripts/generate-docs.mjs. Do not edit directly.",
    `export const repoCatalog = ${JSON.stringify(catalog, null, 2)} as const;`,
    "",
    "export type RepoCatalog = typeof repoCatalog;",
    "",
  ].join("\n");
}

function escapeMarkdownCell(value) {
  return value.replaceAll("|", "\\|").replace(/\s+/g, " ").trim();
}
