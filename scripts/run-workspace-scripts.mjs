import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const [workspaceRoot, scriptName, ...options] = process.argv.slice(2);
const ifPresent = options.includes("--if-present");
const excluded = new Set(options.flatMap((option, index) => option === "--exclude" ? [options[index + 1]] : []));

if (workspaceRoot === undefined || scriptName === undefined) {
  console.error("usage: node scripts/run-workspace-scripts.mjs <workspace-root> <script> [--if-present] [--exclude <package-name-or-dir>]");
  process.exit(1);
}

const absoluteWorkspaceRoot = join(root, workspaceRoot);
if (!existsSync(absoluteWorkspaceRoot)) {
  console.error(`${workspaceRoot}: workspace root does not exist.`);
  process.exit(1);
}

const packages = readdirSync(absoluteWorkspaceRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => {
    const packagePath = join(absoluteWorkspaceRoot, entry.name, "package.json");
    if (!existsSync(packagePath)) return null;
    const pkg = JSON.parse(readFileSync(packagePath, "utf8"));
    return {
      dir: `${workspaceRoot}/${entry.name}`,
      name: pkg.name,
      hasScript: Object.hasOwn(pkg.scripts ?? {}, scriptName),
    };
  })
  .filter((pkg) => pkg !== null)
  .filter((pkg) => !excluded.has(pkg.name) && !excluded.has(pkg.dir))
  .sort((left, right) => left.dir.localeCompare(right.dir));

if (packages.length === 0) {
  console.error(`${workspaceRoot}: no workspace packages found.`);
  process.exit(1);
}

let failed = false;
for (const pkg of packages) {
  if (typeof pkg.name !== "string" || pkg.name.length === 0) {
    console.error(`${pkg.dir}: package name is required.`);
    failed = true;
    continue;
  }
  if (!pkg.hasScript) {
    if (ifPresent) continue;
    console.error(`${pkg.name}: missing "${scriptName}" script.`);
    failed = true;
    continue;
  }

  console.log(`$ npm run ${scriptName} -w ${pkg.name}`);
  const result = spawnSync("npm", ["run", scriptName, "-w", pkg.name], {
    cwd: root,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    failed = true;
  }
}

if (failed) process.exit(1);
