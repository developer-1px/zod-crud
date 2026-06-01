import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const check = process.argv.includes("--check");

const outputs = [
  ["docs/generated/repo-catalog.json", () => `${JSON.stringify(createRepoCatalog(), null, 2)}\n`],
  ["docs/generated/extensions-catalog.md", () => renderExtensionsCatalog(createRepoCatalog())],
  ["apps/site/src/generated/repo-catalog.ts", () => renderSiteCatalog(createRepoCatalog())],
];

const extensionGuidance = {
  "@zod-crud/autosave": {
    useFor: "schedule host-owned saves after document changes",
    notFor: "retry queues, offline sync, or server conflict resolution",
  },
  "@zod-crud/batch-set": {
    useFor: "set a field across a list of selected item pointers to a constant or computed value",
    notFor: "selecting which items to edit, or JSONPath query-driven replacement",
  },
  "@zod-crud/bookmarks": {
    useFor: "keep named JSON Pointer locations stable across edits",
    notFor: "browser bookmarks or route state",
  },
  "@zod-crud/bulk-edit": {
    useFor: "apply JSONPath replace/delete operations to many document positions",
    notFor: "rendered text search UI or product workflow approval",
  },
  "@zod-crud/checkpoints": {
    useFor: "name and restore document snapshots",
    notFor: "durable version graphs or cloud backup",
  },
  "@zod-crud/clear-values": {
    useFor: "reset selected fields to schema-derived empty values, keeping structure",
    notFor: "structural delete, caller-supplied bulk replace, or enum/object default policy",
  },
  "@zod-crud/clipboard-web": {
    useFor: "bridge zod-crud clipboard payloads to the browser clipboard",
    notFor: "TSV/CSV spreadsheet paste engines",
  },
  "@zod-crud/coerce": {
    useFor: "convert a field type (string/number/integer/boolean) where the schema permits it",
    notFor: "locale/format-aware parsing of currency or dates, or input masks",
  },
  "@zod-crud/collection": {
    useFor: "edit ordered JSON arrays with item-level commands",
    notFor: "database collections or rendered list UI",
  },
  "@zod-crud/id-resolver": {
    useFor: "resolve scoped stable ids to current JSON Pointers",
    notFor: "id generation, relation graphs, routing, or server identity",
  },
  "@zod-crud/cycle": {
    useFor: "toggle a boolean or advance an enum/value field (enum options come from the schema)",
    notFor: "rendered toggle controls or keyboard policy",
  },
  "@zod-crud/collection-sort": {
    useFor: "sort or reverse JSON array items",
    notFor: "query views, filters, or server sorting",
  },
  "@zod-crud/comments": {
    useFor: "anchor review comments to document structure",
    notFor: "comment UI, moderation, or author storage",
  },
  "@zod-crud/computed-fields": {
    useFor: "sync host-computed derived JSON fields",
    notFor: "formula languages or dependency runtimes",
  },
  "@zod-crud/convert-node-kind": {
    useFor: "convert selected nodes between host-described kinds",
    notFor: "schema migration systems",
  },
  "@zod-crud/dedupe": {
    useFor: "remove duplicate array items by whole value or a host key",
    notFor: "fuzzy matching, cross-array dedupe, or JSONPath match deletion",
  },
  "@zod-crud/dirty-state": {
    useFor: "compare a document to a clean baseline",
    notFor: "persistence or server save status",
  },
  "@zod-crud/document-diff": {
    useFor: "produce and apply patch changes toward a target document",
    notFor: "visual diff UI or merge conflict resolution",
  },
  "@zod-crud/drag-drop": {
    useFor: "turn drag/drop intent into move or paste operations",
    notFor: "DOM drag/drop events, hit testing, or hover UI",
  },
  "@zod-crud/ensure-fields": {
    useFor: "add missing object keys from a defaults map without overwriting existing ones",
    notFor: "filling existing empty values, removing unknown keys, or deep merge",
  },
  "@zod-crud/fill-empty": {
    useFor: "fill only empty slots across targets, preserving non-empty values",
    notFor: "adding missing fields, choosing targets, or unconditional batch set",
  },
  "@zod-crud/fill-series": {
    useFor: "fill a value or linear series across a contiguous sibling range",
    notFor: "date/pattern series, 2D grid fill, or fill-handle drag UI",
  },
  "@zod-crud/form-draft": {
    useFor: "hold temporary invalid form input before committing valid JSON",
    notFor: "rendered form components",
  },
  "@zod-crud/forward-fill": {
    useFor: "carry the last non-empty value into the empty slots that follow (ffill)",
    notFor: "constant fill, numeric series interpolation, or rendered grid UI",
  },
  "@zod-crud/grid-paste": {
    useFor: "paste a 2D value matrix onto a rectangular array-of-records region",
    notFor: "TSV/CSV parsing, clipboard I/O, or auto-growing the array",
  },
  "@zod-crud/grouping": {
    useFor: "group and ungroup selected sibling JSON items",
    notFor: "Airtable group-by views",
  },
  "@zod-crud/limit": {
    useFor: "cap a JSON array to at most N items, keeping the start or end",
    notFor: "choosing survivors beyond start/end, or auto-trimming on insert",
  },
  "@zod-crud/move-selection": {
    useFor: "move a contiguous selection of sibling items to a new position",
    notFor: "single-item moves, drag/drop events, or cross-array moves",
  },
  "@zod-crud/join-text": {
    useFor: "join an array into a string field with a separator (inverse of split-text)",
    notFor: "locale list formatting, or reading the result without writing",
  },
  "@zod-crud/layer-order": {
    useFor: "reorder visual stack arrays with bring/send commands",
    notFor: "canvas rendering or z-index CSS management",
  },
  "@zod-crud/number-step": {
    useFor: "increment, decrement, or step a numeric field with optional clamping",
    notFor: "rendered spinners, formatting, units, or currency",
  },
  "@zod-crud/outline": {
    useFor: "project and edit nested document outline structures",
    notFor: "Figma layer panels without a tree schema adapter",
  },
  "@zod-crud/paste-compatible": {
    useFor: "adapt external payloads before schema-safe paste",
    notFor: "browser clipboard I/O or autocomplete dropdowns",
  },
  "@zod-crud/pad": {
    useFor: "pad a string field to a minimum length (zero-padded codes/IDs)",
    notFor: "number formatting or display-time alignment",
  },
  "@zod-crud/patch-log": {
    useFor: "record and replay applied JSON Patch records",
    notFor: "product activity feeds or audit authorization",
  },
  "@zod-crud/patch-preview": {
    useFor: "preview patch effects before confirmation",
    notFor: "visual diff rendering",
  },
  "@zod-crud/persist-web": {
    useFor: "save and restore documents in browser storage-like hosts",
    notFor: "server sync, auth, or conflict resolution",
  },
  "@zod-crud/presence-cursors": {
    useFor: "track remote collaborator cursors and selections",
    notFor: "CRDT/OT or realtime transport",
  },
  "@zod-crud/proposed-changes": {
    useFor: "review, accept, or reject proposed document patches",
    notFor: "slash commands or mention autocomplete",
  },
  "@zod-crud/protected-ranges": {
    useFor: "guard edits to protected JSON Pointer ranges",
    notFor: "2D spreadsheet selection UI or server authorization",
  },
  "@zod-crud/reindex": {
    useFor: "sync an order/position field to each item array position after a reorder",
    notFor: "reordering the array itself, or fractional/gap indexing",
  },
  "@zod-crud/references": {
    useFor: "track stable references and backlinks over JSON documents",
    notFor: "route state or rendered links",
  },
  "@zod-crud/schema-form": {
    useFor: "derive schema-backed field descriptors",
    notFor: "form rendering or input widgets",
  },
  "@zod-crud/round": {
    useFor: "round a number to a precision or nearest step (round/floor/ceil/trunc)",
    notFor: "currency/locale formatting, or increment/clamp (see number-step)",
  },
  "@zod-crud/search-replace": {
    useFor: "find and replace text across document string fields",
    notFor: "rendered text extraction or search UI",
  },
  "@zod-crud/swap": {
    useFor: "exchange the positions of two items in the same array",
    notFor: "cross-array swaps or moving to an arbitrary index",
  },
  "@zod-crud/truncate": {
    useFor: "cap a string field to a max length with optional ellipsis and word boundary",
    notFor: "display-time CSS truncation or grapheme/locale-aware length",
  },
  "@zod-crud/text-transform": {
    useFor: "apply case/whitespace transforms (upper, lower, trim, title) to a string field",
    notFor: "locale-aware casing, rich text formatting toolbars, or find/replace",
  },
  "@zod-crud/split-text": {
    useFor: "split a string into array items by a delimiter (tag input, paste-as-list)",
    notFor: "CSV/TSV quoting, split-to-columns, or clipboard access",
  },
  "@zod-crud/set-membership": {
    useFor: "toggle, add, or remove a value's presence in a JSON array (tag/multi-select)",
    notFor: "ordered insertion position or deduping an existing array",
  },
  "@zod-crud/slugify": {
    useFor: "derive a URL-safe slug from a string field (CMS title to slug)",
    notFor: "uniqueness/collision handling or non-Latin transliteration",
  },
  "@zod-crud/snippets": {
    useFor: "insert reusable JSON payloads with schema-safe paste checks",
    notFor: "slash palette UI or snippet storage",
  },
  "@zod-crud/wrap-unwrap": {
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
    packageDoc(entry.path, entry.name === "zod-crud" ? "core" : "official-extension"),
  );
  const labExtensions = packageEntries("labs/extensions").map((entry) =>
    packageDoc(entry.path, "lab-extension"),
  );
  const apps = packageEntries("apps").map((entry) => packageDoc(entry.path, "app"));
  const rootPackage = readJson("package.json");
  const readme = readIfExists("README.md");

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
