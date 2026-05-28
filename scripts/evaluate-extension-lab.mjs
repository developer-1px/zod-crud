import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const labRoot = "labs/extensions";
const verify = process.argv.includes("--verify");

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

for (const dir of labs) {
  const pkg = JSON.parse(read(`${dir}/package.json`));
  const label = pkg.name ?? dir;

  if (!pkg.name?.startsWith("@zod-crud/")) {
    fail(`${label}: package name must stay under @zod-crud.`);
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
