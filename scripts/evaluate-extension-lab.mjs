import { spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { availableParallelism } from "node:os";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const labRoot = "labs/extensions";
const officialRoot = "packages";
const verify = process.argv.includes("--verify");
const verifyChanged = process.argv.includes("--changed");
const fullVerificationPathPatterns = [
  /^package(?:-lock)?\.json$/,
  /^packages\/json-document\//,
  /^scripts\/evaluate-extension-lab\.mjs$/,
];
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
  "snippets",
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

function option(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
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

function formatCommand(command, args, cwd = root) {
  const relativeCwd = cwd === root ? "." : cwd.slice(root.length).replace(/^\//, "");
  return `$ ${command} ${args.join(" ")}  # cwd=${relativeCwd}`;
}

function run(command, args, cwd = root) {
  const label = formatCommand(command, args, cwd);
  console.log(label);
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${label} failed with exit code ${code}\n${output}`));
    });
  });
}

function verifyConcurrency() {
  const configured = Number(process.env.LAB_EXTENSIONS_VERIFY_CONCURRENCY);
  if (Number.isInteger(configured) && configured > 0) return configured;
  return Math.min(4, Math.max(1, availableParallelism()));
}

function gitChangedFiles() {
  const base = option("--base") ?? process.env.LAB_EXTENSIONS_BASE ?? null;
  const head = option("--head") ?? process.env.LAB_EXTENSIONS_HEAD ?? "HEAD";
  if (base === null || /^0+$/.test(base)) {
    return { files: null, reason: "missing diff base" };
  }

  const result = spawnSync("git", ["diff", "--name-only", base, head], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) {
    return { files: null, reason: `git diff failed for ${base}..${head}` };
  }

  return {
    files: result.stdout.split(/\r?\n/).filter((path) => path.length > 0),
    reason: `${base}..${head}`,
  };
}

function labDirFromPath(path) {
  const parts = path.split("/");
  if (parts[0] !== "labs" || parts[1] !== "extensions" || parts[2] === undefined) return null;
  return `${labRoot}/${parts[2]}`;
}

function verificationSelection(labs) {
  if (!verifyChanged) {
    return { dirs: new Set(labs), reason: "full verification requested" };
  }

  const { files: changedFiles, reason } = gitChangedFiles();
  if (changedFiles === null) {
    return { dirs: new Set(labs), reason: `${reason}; falling back to full verification` };
  }
  if (changedFiles.some((path) => fullVerificationPathPatterns.some((pattern) => pattern.test(path)))) {
    return { dirs: new Set(labs), reason: `${reason}; shared lab dependency changed` };
  }

  const availableLabs = new Set(labs);
  const selectedLabs = new Set();
  for (const file of changedFiles) {
    const labDir = labDirFromPath(file);
    if (labDir !== null && availableLabs.has(labDir)) {
      selectedLabs.add(labDir);
    }
  }
  return { dirs: selectedLabs, reason };
}

async function verifyPackage({ dir, name }) {
  const packageRoot = join(root, dir);
  await run("npx", ["--no-install", "tsc", "-p", "tsconfig.test.json", "--noEmit"], packageRoot);
  await run("npx", ["--no-install", "vitest", "run", "--config", "vitest.config.ts"], packageRoot);
  rmSync(join(packageRoot, "dist"), { recursive: true, force: true });
  await run("npx", ["--no-install", "tsc", "-p", "tsconfig.json"], packageRoot);
  await run("node", ["--input-type=module", "--eval", `await import(${JSON.stringify(name)});`], packageRoot);
  console.log(`[ok] ${name}`);
}

async function verifyPackages(targets) {
  const concurrency = Math.min(verifyConcurrency(), targets.length);
  console.log(`extension lab verify concurrency: ${concurrency}`);

  let cursor = 0;
  const failures = [];
  async function worker() {
    while (cursor < targets.length) {
      const target = targets[cursor];
      cursor += 1;
      try {
        await verifyPackage(target);
      } catch (error) {
        failures.push(error);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  for (const failure of failures) {
    fail(failure.message);
  }
}

const labs = packages();
if (labs.length === 0) {
  fail("extension lab: no lab packages found.");
}
const officialPackageNames = new Set(officialPackages().map((pkg) => pkg.name));
const selectedVerification = verify ? verificationSelection(labs) : { dirs: new Set(), reason: "check only" };
const verificationTargets = [];

for (const dir of labs) {
  const pkg = JSON.parse(read(`${dir}/package.json`));
  const label = pkg.name ?? dir;
  const folderName = dir.slice(dir.lastIndexOf("/") + 1);
  const packageName = typeof pkg.name === "string" && pkg.name.startsWith("@interactive-os/json-document-")
    ? pkg.name.slice("@interactive-os/json-document-".length)
    : null;

  if (!pkg.name?.startsWith("@interactive-os/json-document-")) {
    fail(`${label}: package name must stay under @json-document.`);
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
  if (pkg.peerDependencies?.["@interactive-os/json-document"] !== "^1.0.0") {
    fail(`${label}: json-document must stay a peer dependency.`);
  }
  if (pkg.dependencies?.["@interactive-os/json-document"]) {
    fail(`${label}: json-document must not be a runtime dependency.`);
  }
  if (pkg.sideEffects !== false) {
    fail(`${label}: sideEffects must be false.`);
  }
  if (!existsSync(join(root, dir, "README.md"))) {
    fail(`${label}: README.md is required for lab review.`);
  }
  const readme = read(`${dir}/README.md`);
  for (const [section, pattern] of [
    ["Scope", /^## Scope\b/m],
    ["Non-goals", /^## Non-goals\b/m],
    ["Friction report", /^## Friction report\b/m],
  ]) {
    if (!pattern.test(readme)) {
      fail(`${label}: README.md must include a ${section} section.`);
    }
  }

  for (const sourcePath of files(`${dir}/src`)) {
    const source = read(sourcePath);
    for (const match of source.matchAll(/\bfrom\s+["']([^"']+)["']/g)) {
      const specifier = match[1];
      if (specifier === "@interactive-os/json-document") continue;
      if (specifier.startsWith(".")) continue;
      fail(`${sourcePath}: lab source must import json-document only through the public package entrypoint (${specifier}).`);
    }
    if (/src\/application|src\/domain|src\/foundation|\.\.\/json-document\/src/.test(source)) {
      fail(`${sourcePath}: lab source must not import json-document internals.`);
    }
    if (/doc\.use\s*\(/.test(source)) {
      fail(`${sourcePath}: lab extension must compose functions, not register plugins.`);
    }
  }

  if (verify && selectedVerification.dirs.has(dir)) {
    verificationTargets.push({ dir, name: pkg.name });
  }
}

if (verify && process.exitCode !== 1) {
  console.log(`extension lab verify scope: ${verificationTargets.length}/${labs.length} package(s); ${selectedVerification.reason}`);
  if (verificationTargets.length > 0) {
    await verifyPackages(verificationTargets);
  }
}

console.log(`extension lab evaluation ok: ${labs.length} package(s) checked${verify ? `, ${verificationTargets.length} verified` : ""}`);

function officialPackages() {
  const absoluteRoot = join(root, officialRoot);
  if (!existsSync(absoluteRoot)) return [];
  return readdirSync(absoluteRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== "@interactive-os/json-document")
    .filter((entry) => existsSync(join(absoluteRoot, entry.name, "package.json")))
    .map((entry) => JSON.parse(read(`${officialRoot}/${entry.name}/package.json`)))
    .filter((pkg) => typeof pkg.name === "string" && pkg.name.startsWith("@interactive-os/json-document-"));
}
