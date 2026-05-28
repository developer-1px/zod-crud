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
    root: "packages/record-index",
    name: "@zod-crud/record-index",
    description: /stable record identity extension functions/,
    readme: [
      /createRecordIndex\(doc/,
      /focused rows, selected cards, slide blocks, layer items, admin\s*sections, or spreadsheet tabs/,
      /Stable identity is an extension concern/,
      /does not call\s*`doc\.use\(\.\.\.\)`/,
    ],
  },
  {
    root: "packages/selection-model",
    name: "@zod-crud/selection-model",
    description: /pointer selection model extension functions/,
    readme: [
      /createSelectionModel\(doc\)/,
      /selected kanban cards, outliner rows, slide blocks, admin sections, layer\s*items, or spreadsheet tabs/,
      /Stable identity lookup; use `@zod-crud\/record-index`/,
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
