import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const labRoot = "labs/extensions";
const officialRoot = "packages";
const verify = process.argv.includes("--verify");
const retiredLabNames = new Set([
  "annotations",
  "comments",
  "document-outline",
  "drop-intent",
  "field-draft",
  "form-draft",
  "outline",
  "patch-preview",
  "pointer-bookmarks",
  "proposed-changes",
  "protected-ranges",
  "suggestions",
  "text-search",
  "search-replace",
]);

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function packages() {
  const absoluteRoot = join(root, labRoot);
  if (!existsSync(absoluteRoot)) return [];
  return readdirSync(absoluteRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `${labRoot}/${entry.name}`)
    .filter((dir) => existsSync(join(root, dir, "package.json")))
    .sort();
}

function files(dir) {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return files(path);
    return entry.isFile() && path.endsWith(".ts") ? [path] : [];
  });
}

function run(command, args, cwd = root) {
  const relativeCwd = cwd === root ? "." : cwd.slice(root.length).replace(/^\//, "");
  console.log(`$ ${command} ${args.join(" ")}  # cwd=${relativeCwd}`);
  execFileSync(command, args, { cwd, stdio: "inherit" });
}

const labs = packages();
if (labs.length === 0) {
  fail("extension lab: no lab packages found.");
}
const officialPackageNames = new Set(officialPackages().map((pkg) => pkg.name));

for (const dir of labs) {
  const pkg = JSON.parse(read(`${dir}/package.json`));
  const label = pkg.name ?? dir;
  const folderName = dir.slice(dir.lastIndexOf("/") + 1);
  const packageName = typeof pkg.name === "string" && pkg.name.startsWith("@zod-crud/")
    ? pkg.name.slice("@zod-crud/".length)
    : null;

  if (!pkg.name?.startsWith("@zod-crud/")) {
    fail(`${label}: package name must stay under @zod-crud.`);
  }
  if (packageName !== folderName) {
    fail(`${label}: package name must match its lab folder (${folderName}).`);
  }
  if (retiredLabNames.has(folderName) || (packageName !== null && retiredLabNames.has(packageName))) {
    fail(`${label}: retired implementation-shaped lab name must not be reintroduced.`);
  }
  if (typeof pkg.name === "string" && officialPackageNames.has(pkg.name)) {
    fail(`${label}: lab package name collides with an official package. Retire the lab or choose a distinct experimental concept name.`);
  }
  if (pkg.private !== true) {
    fail(`${label}: lab packages must be private until promoted.`);
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
  if (!existsSync(join(root, dir, "README.md"))) {
    fail(`${label}: README.md is required for lab review.`);
  }

  for (const sourcePath of files(`${dir}/src`)) {
    const source = read(sourcePath);
    for (const match of source.matchAll(/\bfrom\s+["']([^"']+)["']/g)) {
      const specifier = match[1];
      if (specifier === "zod-crud") continue;
      if (specifier.startsWith(".")) continue;
      fail(`${sourcePath}: lab source must import zod-crud only through the public package entrypoint (${specifier}).`);
    }
    if (/src\/application|src\/domain|src\/foundation|\.\.\/zod-crud\/src/.test(source)) {
      fail(`${sourcePath}: lab source must not import zod-crud internals.`);
    }
    if (/doc\.use\s*\(/.test(source)) {
      fail(`${sourcePath}: lab extension must compose functions, not register plugins.`);
    }
  }

  if (!verify) continue;

  const packageRoot = join(root, dir);
  run("npx", ["--no-install", "tsc", "-p", "tsconfig.test.json", "--noEmit"], packageRoot);
  run("npx", ["--no-install", "vitest", "run", "--config", "vitest.config.ts"], packageRoot);
  rmSync(join(packageRoot, "dist"), { recursive: true, force: true });
  run("npx", ["--no-install", "tsc", "-p", "tsconfig.json"], packageRoot);
}

console.log(`extension lab evaluation ok: ${labs.length} package(s)${verify ? " verified" : " checked"}`);

function officialPackages() {
  const absoluteRoot = join(root, officialRoot);
  if (!existsSync(absoluteRoot)) return [];
  return readdirSync(absoluteRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== "zod-crud")
    .filter((entry) => existsSync(join(absoluteRoot, entry.name, "package.json")))
    .map((entry) => JSON.parse(read(`${officialRoot}/${entry.name}/package.json`)))
    .filter((pkg) => typeof pkg.name === "string" && pkg.name.startsWith("@zod-crud/"));
}
