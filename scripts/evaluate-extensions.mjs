import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const extensionRoot = "packages/clipboard-web";

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

const pkg = JSON.parse(read(`${extensionRoot}/package.json`));
const readme = read(`${extensionRoot}/README.md`);

if (pkg.name !== "@zod-crud/clipboard-web") {
  fail("clipboard-web package: unexpected package name.");
}
if (!/extension functions/.test(pkg.description ?? "")) {
  fail("clipboard-web package: description must describe an extension, not a core adapter.");
}
if (pkg.peerDependencies?.["zod-crud"] !== "^1.0.0") {
  fail("clipboard-web package: zod-crud must stay a peer dependency.");
}
if (pkg.dependencies?.["zod-crud"]) {
  fail("clipboard-web package: zod-crud must not be a runtime dependency.");
}
if (pkg.sideEffects !== false) {
  fail("clipboard-web package: sideEffects must be false.");
}

for (const sourcePath of files(`${extensionRoot}/src`)) {
  const source = read(sourcePath);
  for (const match of source.matchAll(/\bfrom\s+["']([^"']+)["']/g)) {
    const specifier = match[1];
    if (specifier === "zod-crud") continue;
    if (specifier.startsWith(".") && !specifier.includes("../zod-crud")) continue;
    fail(`${sourcePath}: extension source must import zod-crud only through the package entrypoint (${specifier}).`);
  }
  if (/doc\.use\s*\(/.test(source)) {
    fail(`${sourcePath}: extension must compose functions, not register plugins.`);
  }
}

for (const pattern of [
  /createWebClipboard\(doc\)/,
  /does not add plugin registration/,
  /\{ readText, writeText \}/,
]) {
  if (!pattern.test(readme)) fail(`clipboard-web README: missing ${pattern}.`);
}
