import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, extname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspace = await mkdtemp(join(tmpdir(), "zod-crud-package-"));
const npmCache = join(workspace, ".npm-cache");
const packageJson = JSON.parse(await readFile(join(repoRoot, "package.json"), "utf8"));
const readmeSource = await readFile(join(repoRoot, "README.md"), "utf8");
const rootSource = await readFile(join(repoRoot, "src", "index.ts"), "utf8");
const reactSource = await readFile(join(repoRoot, "src", "react.ts"), "utf8");
const rootExports = extractExports(rootSource);
const reactExports = extractExports(reactSource);
const sourceModules = await sourceModulePaths(join(repoRoot, "src"));
const verbEntries = await readdir(join(repoRoot, "src", "verbs"), { withFileTypes: true });
const verbNames = verbEntries
  .filter((entry) => entry.isFile() && extname(entry.name) === ".ts")
  .map((entry) => basename(entry.name, ".ts"))
  .sort();
const verbExports = Object.fromEntries(await Promise.all(verbNames.map(async (name) => [
  name,
  extractExports(await readFile(join(repoRoot, "src", "verbs", `${name}.ts`), "utf8")),
])));
const verbPublicExports = mapExportNames(verbExports, "public");
const verbValueExports = mapExportNames(verbExports, "value");
const verbTypeOnlyExports = mapExportNames(verbExports, "typeOnly");
const rootValueExports = rootExports.value;
const reactValueExports = reactExports.value;
const rootPublicExports = rootExports.public;
const reactPublicExports = reactExports.public;
const rootTypeExports = rootPublicExports.filter((name) => !rootValueExports.includes(name));
const reactTypeExports = reactPublicExports.filter((name) => !reactValueExports.includes(name));
const rootTypeOnlyExports = rootExports.typeOnly;
const reactTypeOnlyExports = reactExports.typeOnly;

function run(command, args, cwd) {
  try {
    execFileSync(command, args, {
      cwd,
      env: { ...process.env, npm_config_cache: npmCache },
      stdio: "pipe",
    });
  } catch (error) {
    throw new Error(formatCommandFailure(command, args, cwd, error), { cause: error });
  }
}

function expectCommandFailure(command, args, cwd, expectedText) {
  try {
    execFileSync(command, args, {
      cwd,
      env: { ...process.env, npm_config_cache: npmCache },
      stdio: "pipe",
    });
  } catch (error) {
    const stdout = bufferToString(error.stdout);
    const stderr = bufferToString(error.stderr);
    const output = `${stdout}\n${stderr}`;
    if (!output.includes(expectedText)) {
      throw new Error(formatCommandFailure(command, args, cwd, error), { cause: error });
    }
    return;
  }

  throw new Error(`Command unexpectedly succeeded in package smoke: ${[command, ...args].join(" ")}`);
}

function formatCommandFailure(command, args, cwd, error) {
  const output = [];
  output.push(`Command failed in package smoke: ${[command, ...args].join(" ")}`);
  output.push(`cwd: ${cwd}`);
  const stdout = bufferToString(error.stdout);
  const stderr = bufferToString(error.stderr);
  if (stdout) output.push(`stdout:\n${stdout}`);
  if (stderr) output.push(`stderr:\n${stderr}`);
  return output.join("\n\n");
}

function bufferToString(value) {
  if (Buffer.isBuffer(value)) return value.toString("utf8").trim();
  if (typeof value === "string") return value.trim();
  return "";
}

function existingZodPackage() {
  return existingPath([
    join(repoRoot, "node_modules", "zod"),
    join(repoRoot, "..", "..", "node_modules", "zod"),
  ]);
}

function existingTypeScriptBin() {
  return existingPath([
    join(repoRoot, "node_modules", "typescript", "bin", "tsc"),
    join(repoRoot, "..", "..", "node_modules", "typescript", "bin", "tsc"),
  ]);
}

function existingReactPackage() {
  return existingPath([
    join(repoRoot, "node_modules", "react"),
    join(repoRoot, "..", "..", "node_modules", "react"),
  ]);
}

function existingReactTypesPackage() {
  return existingPath([
    join(repoRoot, "node_modules", "@types", "react"),
    join(repoRoot, "..", "..", "node_modules", "@types", "react"),
  ]);
}

function existingPath(candidates) {
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function extractExports(source) {
  const value = [];
  const typeOnly = [];

  for (const match of source.matchAll(/^export( type)? \{([\s\S]*?)\} from/gm)) {
    const isTypeOnly = match[1] !== undefined;
    const block = match[2];
    if (block === undefined) {
      throw new Error("Export block capture failed");
    }
    const names = exportNames(block);
    if (isTypeOnly) {
      typeOnly.push(...names);
    } else {
      value.push(...names);
    }
  }
  for (const match of source.matchAll(/^export\s+(interface|type)\s+([A-Za-z_$][\w$]*)/gm)) {
    const name = match[2];
    if (name === undefined) {
      throw new Error("Type declaration export capture failed");
    }
    typeOnly.push(name);
  }
  for (const match of source.matchAll(/^export\s+(class|const|function)\s+([A-Za-z_$][\w$]*)/gm)) {
    const name = match[2];
    if (name === undefined) {
      throw new Error("Value declaration export capture failed");
    }
    value.push(name);
  }

  return {
    public: uniqueSorted([...value, ...typeOnly]),
    typeOnly: uniqueSorted(typeOnly),
    value: uniqueSorted(value),
  };
}

function exportNames(block) {
  const names = [];
  for (const rawPart of block.split(",")) {
    const part = rawPart.replace(/\/\/.*$/gm, "").trim();
    if (part.length === 0) continue;
    const exportedName = part.split(/\s+as\s+/).at(-1)?.split(/\s+/)[0];
    if (exportedName === undefined) {
      throw new Error(`Export name capture failed: ${part}`);
    }
    names.push(exportedName);
  }

  return names;
}

function uniqueSorted(names) {
  return [...new Set(names)].sort();
}

function mapExportNames(exportsByModule, field) {
  return Object.fromEntries(Object.entries(exportsByModule).map(([name, exports]) => [name, exports[field]]));
}

function markdownCodeBlockAfterHeading(source, heading, language) {
  const headingIndex = source.indexOf(`## ${heading}`);
  if (headingIndex === -1) throw new Error(`README heading missing: ${heading}`);
  const rest = source.slice(headingIndex);
  const match = rest.match(new RegExp(`\`\`\`${language}\\n([\\s\\S]*?)\\n\`\`\``));
  if (!match?.[1]) throw new Error(`README ${heading} ${language} code block missing`);
  return match[1];
}

function assertDeclarationExports(declarationSource, expectedNames, label) {
  for (const name of expectedNames) {
    const exportNamePattern = new RegExp(`(^|[^A-Za-z0-9_$])${name}([^A-Za-z0-9_$]|$)`);
    if (!exportNamePattern.test(declarationSource)) {
      throw new Error(`${label} declaration export missing: ${name}`);
    }
  }
}

async function assertDeclarationSpecifiers(installedPackageRoot) {
  const distRoot = join(installedPackageRoot, "dist");
  const declarationPaths = await declarationModulePaths(distRoot);
  const declarationSet = new Set(declarationPaths);
  const allowedBareSpecifiers = new Set(["react", "zod"]);

  for (const declarationPath of declarationPaths) {
    const source = await readFile(join(distRoot, declarationPath), "utf8");
    const specifiers = moduleSpecifiers(source);

    for (const specifier of specifiers) {
      if (specifier === undefined) throw new Error(`Declaration specifier capture failed: ${declarationPath}`);
      if (specifier.startsWith(".")) {
        const resolved = resolve(dirname(join(distRoot, declarationPath)), specifier)
          .replace(/\.js$/, ".d.ts")
          .slice(distRoot.length + 1);
        if (!declarationSet.has(resolved)) {
          throw new Error(`Declaration import does not resolve inside package: ${declarationPath} -> ${specifier}`);
        }
      } else if (!allowedBareSpecifiers.has(specifier)) {
        throw new Error(`Declaration imports unexpected bare specifier: ${declarationPath} -> ${specifier}`);
      }
    }
  }
}

async function assertRuntimeSpecifiers(installedPackageRoot) {
  const distRoot = join(installedPackageRoot, "dist");
  const runtimePaths = await runtimeModulePaths(distRoot);
  const runtimeSet = new Set(runtimePaths);
  const allowedBareSpecifiers = new Set(["react", "zod"]);

  for (const runtimePath of runtimePaths) {
    const source = await readFile(join(distRoot, runtimePath), "utf8");
    const specifiers = moduleSpecifiers(source);

    for (const specifier of specifiers) {
      if (specifier === undefined) throw new Error(`Runtime specifier capture failed: ${runtimePath}`);
      if (specifier.startsWith(".")) {
        const resolved = resolve(dirname(join(distRoot, runtimePath)), specifier)
          .slice(distRoot.length + 1);
        if (!runtimeSet.has(resolved)) {
          throw new Error(`Runtime import does not resolve inside package: ${runtimePath} -> ${specifier}`);
        }
      } else if (!allowedBareSpecifiers.has(specifier)) {
        throw new Error(`Runtime imports unexpected bare specifier: ${runtimePath} -> ${specifier}`);
      }
    }
  }
}

function moduleSpecifiers(source) {
  return [
    ...Array.from(source.matchAll(/\b(?:import|export)\s+[^;"']*\s+from\s+["']([^"']+)["']/g), (match) => match[1]),
    ...Array.from(source.matchAll(/\bimport\s+["']([^"']+)["']/g), (match) => match[1]),
  ];
}

async function declarationModulePaths(dir, prefix = "") {
  const entries = await readdir(dir, { withFileTypes: true });
  const paths = [];
  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolutePath = join(dir, entry.name);
    if (entry.isDirectory()) {
      paths.push(...await declarationModulePaths(absolutePath, relativePath));
    } else if (entry.isFile() && entry.name.endsWith(".d.ts")) {
      paths.push(relativePath);
    }
  }

  return paths.sort();
}

async function runtimeModulePaths(dir, prefix = "") {
  const entries = await readdir(dir, { withFileTypes: true });
  const paths = [];
  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolutePath = join(dir, entry.name);
    if (entry.isDirectory()) {
      paths.push(...await runtimeModulePaths(absolutePath, relativePath));
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      paths.push(relativePath);
    }
  }

  return paths.sort();
}

function assertInstalledPackageJson(pkg) {
  const expectedFields = [
    "name",
    "version",
    "description",
    "type",
    "license",
    "sideEffects",
    "main",
    "types",
    "homepage",
    "repository",
    "bugs",
    "publishConfig",
    "keywords",
    "exports",
    "peerDependencies",
    "peerDependenciesMeta",
  ];
  for (const field of expectedFields) {
    if (JSON.stringify(pkg[field]) !== JSON.stringify(packageJson[field])) {
      throw new Error(`Installed package.json field mismatch: ${field}`);
    }
  }
  const forbiddenFields = [
    "bin",
    "config",
    "dependencies",
    "optionalDependencies",
    "overrides",
    "private",
    "workspaces",
  ];
  for (const field of forbiddenFields) {
    if (pkg[field] !== undefined) {
      throw new Error(`Installed package.json must not include ${field}`);
    }
  }
  const installLifecycleScripts = ["preinstall", "install", "postinstall", "prepare"];
  for (const script of installLifecycleScripts) {
    if (pkg.scripts?.[script] !== undefined) {
      throw new Error(`Installed package.json must not include install lifecycle script: ${script}`);
    }
  }
}

function namedImportLine(names, specifier, options = {}) {
  if (names.length === 0) return null;
  const { prefix = "", typeOnly = false } = options;
  const keyword = typeOnly ? "import type" : "import";
  const imports = names
    .map((name) => prefix ? `${name} as ${prefix}${name}` : name)
    .join(", ");
  return `${keyword} { ${imports} } from "${specifier}";`;
}

async function sourceModulePaths(dir, prefix = "") {
  const entries = await readdir(dir, { withFileTypes: true });
  const paths = [];
  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolutePath = join(dir, entry.name);
    if (entry.isDirectory()) {
      paths.push(...await sourceModulePaths(absolutePath, relativePath));
    } else if (entry.isFile() && extname(entry.name) === ".ts") {
      paths.push(relativePath);
    }
  }

  return paths.sort();
}

async function assertInstalledTextFiles(installedPackageRoot) {
  const files = packageJson.files.filter((file) => file !== "dist");
  for (const file of files) {
    const source = await readFile(join(repoRoot, file), "utf8");
    const installed = await readFile(join(installedPackageRoot, file), "utf8");
    if (installed !== source) {
      throw new Error(`Installed package text file differs from source: ${file}`);
    }
  }
}

try {
  const packOutput = execFileSync(
    "npm",
    ["pack", "--json", "--pack-destination", workspace],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, npm_config_cache: npmCache },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const [packResult] = JSON.parse(packOutput);
  const tarball = isAbsolute(packResult.filename)
    ? packResult.filename
    : join(workspace, packResult.filename);
  const zodPackage = existingZodPackage();
  const typeScriptBin = existingTypeScriptBin();
  const reactPackage = existingReactPackage();
  const reactTypesPackage = existingReactTypesPackage();

  if (packResult.name !== packageJson.name) {
    throw new Error(`Packed package name mismatch: ${packResult.name}`);
  }
  if (packResult.version !== packageJson.version) {
    throw new Error(`Packed package version mismatch: ${packResult.version}`);
  }
  if (packResult.filename !== `${packageJson.name}-${packageJson.version}.tgz`) {
    throw new Error(`Packed tarball filename mismatch: ${packResult.filename}`);
  }
  if (typeof packResult.integrity !== "string" || !packResult.integrity.startsWith("sha512-")) {
    throw new Error(`Packed tarball must include sha512 integrity: ${packResult.integrity}`);
  }
  if (typeof packResult.size !== "number" || packResult.size <= 0) {
    throw new Error(`Packed tarball must report a positive compressed size: ${packResult.size}`);
  }
  if (typeof packResult.unpackedSize !== "number" || packResult.unpackedSize <= packResult.size) {
    throw new Error(`Packed tarball must report an unpacked size larger than compressed size: ${packResult.unpackedSize}`);
  }

  if (!existsSync(tarball)) {
    throw new Error(`Packed tarball was not created: ${tarball}`);
  }

  // #62 guard — published tarball 에 node_modules 가 포함되면 소비자 측 zod type 중복으로 generic 추론이 깨진다.
  if (!Array.isArray(packResult.files) || packResult.files.length === 0) {
    throw new Error("Packed tarball must report a non-empty files list");
  }
  if (packResult.entryCount !== packResult.files.length) {
    throw new Error(`Packed tarball entryCount mismatch: ${packResult.entryCount} !== ${packResult.files.length}`);
  }
  if (!Array.isArray(packResult.bundled) || packResult.bundled.length !== 0) {
    throw new Error(`Packed tarball must not bundle dependencies: ${JSON.stringify(packResult.bundled)}`);
  }
  const reportedUnpackedSize = packResult.files.reduce((total, file) => {
    if (typeof file.path !== "string" || file.path.length === 0) {
      throw new Error(`Packed file entry must include a path: ${JSON.stringify(file)}`);
    }
    if (typeof file.size !== "number" || file.size <= 0) {
      throw new Error(`Packed file must report a positive size: ${file.path}`);
    }
    if (file.mode !== 0o644) {
      throw new Error(`Packed file must use regular read/write file mode 0644: ${file.path}`);
    }
    return total + file.size;
  }, 0);
  if (reportedUnpackedSize !== packResult.unpackedSize) {
    throw new Error(`Packed tarball unpackedSize mismatch: ${reportedUnpackedSize} !== ${packResult.unpackedSize}`);
  }
  const packedFiles = packResult.files.map((f) => f.path);
  const offenders = packedFiles.filter((p) => p.includes("node_modules/"));
  if (offenders.length > 0) {
    throw new Error(`Tarball must not include node_modules: ${offenders.slice(0, 3).join(", ")}`);
  }
  const requiredPackageFiles = packageJson.files.filter((file) => file !== "dist");
  requiredPackageFiles.push("package.json");
  for (const required of requiredPackageFiles) {
    if (!packedFiles.includes(required)) {
      throw new Error(`Tarball is missing required package file: ${required}`);
    }
  }
  const allowedPackedRoots = new Set([...packageJson.files, "package.json"]);
  const unexpectedPackedFiles = packedFiles.filter((file) => {
    const [root] = file.split("/");
    return !allowedPackedRoots.has(root);
  });
  if (unexpectedPackedFiles.length > 0) {
    throw new Error(`Tarball includes unexpected files: ${unexpectedPackedFiles.slice(0, 3).join(", ")}`);
  }
  const developmentArtifacts = packedFiles.filter((file) => {
    const name = basename(file);
    if (file.endsWith(".d.ts")) return false;
    return (
      file.endsWith(".ts") ||
      file.endsWith(".tsx") ||
      file.endsWith(".map") ||
      name.endsWith(".test.js") ||
      name.endsWith(".test.ts") ||
      name.endsWith(".test-d.ts") ||
      name === "tsconfig.json" ||
      name.startsWith("tsconfig.") ||
      name === "vitest.config.ts"
    );
  });
  if (developmentArtifacts.length > 0) {
    throw new Error(`Tarball includes development artifacts: ${developmentArtifacts.slice(0, 3).join(", ")}`);
  }
  const expectedDistArtifacts = sourceModules.flatMap((sourcePath) => {
    const distPath = `dist/${sourcePath.slice(0, -".ts".length)}`;
    return [`${distPath}.js`, `${distPath}.d.ts`];
  });
  for (const artifact of expectedDistArtifacts) {
    if (!packedFiles.includes(artifact)) {
      throw new Error(`Tarball is missing dist artifact for src module: ${artifact}`);
    }
  }
  const expectedDistArtifactSet = new Set(expectedDistArtifacts);
  const unexpectedDistArtifacts = packedFiles.filter((file) => {
    if (!file.startsWith("dist/")) return false;
    if (!file.endsWith(".js") && !file.endsWith(".d.ts")) return false;
    return !expectedDistArtifactSet.has(file);
  });
  if (unexpectedDistArtifacts.length > 0) {
    throw new Error(`Tarball includes dist artifacts without source modules: ${unexpectedDistArtifacts.slice(0, 3).join(", ")}`);
  }
  if (packageJson.type !== "module") {
    throw new Error('Package must publish as ESM with "type": "module"');
  }
  if (packageJson.sideEffects !== false) {
    throw new Error('Package must declare "sideEffects": false');
  }
  if (packageJson.dependencies !== undefined && Object.keys(packageJson.dependencies).length > 0) {
    throw new Error(`Package must not publish runtime dependencies: ${Object.keys(packageJson.dependencies).join(",")}`);
  }
  const expectedPeers = { react: ">=18", zod: "^4.0.0" };
  if (JSON.stringify(packageJson.peerDependencies) !== JSON.stringify(expectedPeers)) {
    throw new Error(
      `Package peerDependencies must be ${JSON.stringify(expectedPeers)}: ${JSON.stringify(packageJson.peerDependencies)}`,
    );
  }
  if (packageJson.peerDependenciesMeta?.react?.optional !== true) {
    throw new Error("React peer dependency must be optional");
  }
  const unexpectedPeerMeta = Object.keys(packageJson.peerDependenciesMeta ?? {}).filter((name) => name !== "react");
  if (unexpectedPeerMeta.length > 0) {
    throw new Error(`Package has unexpected peer dependency metadata: ${unexpectedPeerMeta.join(",")}`);
  }
  if (packageJson.main !== packageJson.exports["."].import) {
    throw new Error(`Package main must match root import export: ${packageJson.main}`);
  }
  if (packageJson.types !== packageJson.exports["."].types) {
    throw new Error(`Package types must match root types export: ${packageJson.types}`);
  }
  for (const [subpath, exportMap] of Object.entries(packageJson.exports)) {
    const conditions = Object.keys(exportMap);
    const expectedConditions = ["types", "import"];
    if (JSON.stringify(conditions) !== JSON.stringify(expectedConditions)) {
      throw new Error(`Export ${subpath} conditions must be ${expectedConditions.join(",")}: ${conditions.join(",")}`);
    }
    for (const condition of expectedConditions) {
      const target = exportMap[condition];
      const packedPath = target.replace(/^\.\//, "");
      if (!packedFiles.includes(packedPath)) {
        throw new Error(`Export ${subpath}.${condition} target is missing from tarball: ${target}`);
      }
    }
  }
  const exportedVerbs = Object.keys(packageJson.exports)
    .filter((subpath) => subpath.startsWith("./verbs/"))
    .map((subpath) => subpath.slice("./verbs/".length))
    .sort();
  if (JSON.stringify(exportedVerbs) !== JSON.stringify(verbNames)) {
    throw new Error(
      `Verb exports must match src/verbs/*.ts. exports=${exportedVerbs.join(",")} source=${verbNames.join(",")}`,
    );
  }
  const verbImportLines = exportedVerbs.map((name) => {
    if (name === "paste") {
      return 'import { paste, type RekeyOptions, type RekeyResult } from "zod-crud/verbs/paste";';
    }
    return `import { ${name} } from "zod-crud/verbs/${name}";`;
  });
  const verbTypeImportLines = [
    'import type { ClipboardItemMap, ClipboardItemOptions, CopyError, CopyOk, CopyResult } from "zod-crud/verbs/copy";',
    'import type { CutError, CutOk } from "zod-crud/verbs/cut";',
    'import type { DuplicateError, DuplicateOk, DuplicateOpts } from "zod-crud/verbs/duplicate";',
    'import type { FindError, FindOk } from "zod-crud/verbs/find";',
    'import type { MoveError, MoveOk, MoveResult } from "zod-crud/verbs/move";',
    'import type { PasteDuMismatch, PasteError, PasteMode, PasteOk, PasteOptions, RekeyContext, RekeyStrategy } from "zod-crud/verbs/paste";',
    'import type { RedoResult } from "zod-crud/verbs/redo";',
    'import type { ReplaceError, ReplaceOk } from "zod-crud/verbs/replace";',
    'import type { SelectionAction, SelectionMode, SelectionSnap } from "zod-crud/verbs/select";',
    'import type { UndoEntry, UndoNoop, UndoResult } from "zod-crud/verbs/undo";',
  ];
  const verbFunctionChecks = exportedVerbs.map((name) => `${name} satisfies Function;`);
  const verbRuntimeImportLines = exportedVerbs.map((name) => `import { ${name} } from "zod-crud/verbs/${name}";`);
  const verbRuntimeNamespaceImportLines = exportedVerbs.map((name) => `import * as ${name}Ns from "zod-crud/verbs/${name}";`);
  const verbRuntimeNamespaces = exportedVerbs.map((name) => `  ${name}: ${name}Ns,`);
  const verbRuntimeEntries = exportedVerbs.map((name) => `${name}`).join(", ");

  if (zodPackage === null) {
    throw new Error("Local zod dependency is missing. Run npm install first.");
  }

  if (typeScriptBin === null) {
    throw new Error("Local TypeScript dependency is missing. Run npm install first.");
  }

  if (reactPackage === null) {
    throw new Error("Local react dependency is missing. Run npm install first.");
  }

  if (reactTypesPackage === null) {
    throw new Error("Local @types/react dependency is missing. Run npm install first.");
  }

  await writeFile(
    join(workspace, "package.json"),
    JSON.stringify({ private: true }, null, 2),
  );
  await writeFile(
    join(workspace, "smoke.mjs"),
    [
      'import * as z from "zod";',
      'import * as zc from "zod-crud";',
      'import { applyOperation, applyPatch, parsePointer, tryParsePointer, buildPointer, parentPointer, lastSegment, lastSegmentIndex, appendSegment, withLastSegment, find, replace, buildPatchRequest, parsePatchResponse, withIfMatch, parseMergePatch, applyMergePatch, JSON_PATCH_MIME, MERGE_PATCH_MIME, toJSONSchema, fromJSONSchema } from "zod-crud";',
      'import { move } from "zod-crud/verbs/move";',
      `const expectedRootValueExports = ${JSON.stringify(rootValueExports)};`,
      `const expectedRootTypeOnlyExports = ${JSON.stringify(rootTypeOnlyExports)};`,
      'for (const name of expectedRootValueExports) {',
      '  if (!(name in zc)) throw new Error(`${name} root runtime export missing`);',
      '}',
      'for (const name of expectedRootTypeOnlyExports) {',
      '  if (name in zc) throw new Error(`${name} type-only root export leaked at runtime`);',
      '}',
      'const schema = z.object({ name: z.string(), tags: z.array(z.string()) });',
      'const initial = { name: "ok", tags: [] };',
      'const r = applyOperation(schema, initial, { op: "replace", path: "/name", value: "next" });',
      'if (!r.result.ok) throw new Error("applyOperation failed");',
      'if (r.state.name !== "next") throw new Error("state mismatch");',
      'const r2 = applyPatch(schema, initial, [',
      '  { op: "add", path: "/tags/-", value: "a" },',
      '  { op: "replace", path: "/name", value: "x" },',
      ']);',
      'if (!r2.result.ok) throw new Error("applyPatch failed");',
      'if (r2.state.tags.length !== 1) throw new Error("batch tags failed");',
      'if (parsePointer("/a/0").length !== 2) throw new Error("parsePointer failed");',
      'if (tryParsePointer("/a/0")?.length !== 2) throw new Error("tryParsePointer valid failed");',
      'if (tryParsePointer("a/0") !== null) throw new Error("tryParsePointer invalid failed");',
      'if (buildPointer(["a", 0]) !== "/a/0") throw new Error("buildPointer failed");',
      'if (parentPointer("/a/0") !== "/a") throw new Error("parentPointer failed");',
      'if (lastSegment("/a/0") !== "0") throw new Error("lastSegment failed");',
      'if (lastSegmentIndex("/a/0") !== 0) throw new Error("lastSegmentIndex failed");',
      'if (appendSegment("/a", "b/c") !== "/a/b~1c") throw new Error("appendSegment failed");',
      'if (withLastSegment("/a/0", 1) !== "/a/1") throw new Error("withLastSegment failed");',
      'if (!find(r2.state, "$.tags[0]").ok) throw new Error("find export failed");',
      'if (!replace(schema, r2.state, "$.name", "z").ok) throw new Error("replace export failed");',
      'if (!move(schema, r2.state, "/tags/0", "/tags/0").ok) throw new Error("verb subpath export failed");',
      'const req = buildPatchRequest([{ op: "replace", path: "/name", value: "http" }]);',
      'if (req.headers["content-type"] !== JSON_PATCH_MIME) throw new Error("buildPatchRequest export failed");',
      'const conditional = withIfMatch(req, "\\"etag\\"");',
      'if (conditional.headers["if-match"] !== "\\"etag\\"") throw new Error("withIfMatch export failed");',
      'const parsed = parsePatchResponse(req.body, JSON_PATCH_MIME);',
      'if (!parsed.ok || parsed.ops[0]?.path !== "/name") throw new Error("parsePatchResponse export failed");',
      'const mergeOps = parseMergePatch({ name: "merged", gone: null }, "");',
      'if (mergeOps.length !== 2 || mergeOps[0]?.path !== "/name") throw new Error("parseMergePatch export failed");',
      'const merged = applyMergePatch({ name: "old", meta: { keep: true, drop: true } }, { meta: { drop: null } });',
      'if (merged.meta.drop !== undefined || merged.meta.keep !== true) throw new Error("applyMergePatch export failed");',
      'const mergeParsed = parsePatchResponse("{\\"name\\":\\"merged\\"}", MERGE_PATCH_MIME);',
      'if (!mergeParsed.ok || mergeParsed.ops[0]?.op !== "add") throw new Error("merge patch response export failed");',
      'const jsonSchema = toJSONSchema(schema);',
      'if (jsonSchema.type !== "object") throw new Error("toJSONSchema export failed");',
      'const restoredSchema = fromJSONSchema(jsonSchema);',
      'if (!restoredSchema.safeParse(initial).success) throw new Error("fromJSONSchema export failed");',
    ].join("\n"),
  );
  await writeFile(
    join(workspace, "verbs-subpath-smoke.ts"),
    [
      ...verbImportLines,
      ...verbTypeImportLines,
      ...verbFunctionChecks,
      'type VerbSubpathTypes = [ClipboardItemMap, ClipboardItemOptions, CopyError, CopyOk, CopyResult, CutError, CutOk<{ name: string }>, DuplicateError, DuplicateOk<{ name: string }>, DuplicateOpts, FindError, FindOk, MoveError, MoveOk<{ name: string }>, MoveResult<{ name: string }>, PasteDuMismatch, PasteError, PasteMode, PasteOk<{ name: string }>, PasteOptions, RedoResult<{ name: string }, UndoEntry>, ReplaceError, ReplaceOk<{ name: string }>, SelectionAction, SelectionMode, SelectionSnap, UndoEntry, UndoNoop, UndoResult<{ name: string }, UndoEntry>, RekeyContext, RekeyStrategy];',
      'declare const verbSubpathTypes: VerbSubpathTypes;',
      'verbSubpathTypes satisfies readonly unknown[];',
      'const options: RekeyOptions = { fields: ["id"], strategy: "suffix" };',
      'options.fields satisfies string[];',
      'type RekeyFailure = Extract<RekeyResult, { ok: false }>;',
      'declare const code: RekeyFailure["code"];',
      'code satisfies "not_serializable" | "rekey_failed";',
    ].join("\n"),
  );
  await writeFile(
    join(workspace, "verbs-subpath-smoke.mjs"),
    [
      ...verbRuntimeImportLines,
      ...verbRuntimeNamespaceImportLines,
      `const verbNamespaces = {\n${verbRuntimeNamespaces.join("\n")}\n};`,
      `const expectedVerbValueExports = ${JSON.stringify(verbValueExports)};`,
      `const expectedVerbTypeOnlyExports = ${JSON.stringify(verbTypeOnlyExports)};`,
      `const verbFunctions = { ${verbRuntimeEntries} };`,
      'for (const [name, value] of Object.entries(verbFunctions)) {',
      '  if (typeof value !== "function") throw new Error(`${name} subpath export failed`);',
      '}',
      'for (const [verb, namespace] of Object.entries(verbNamespaces)) {',
      '  for (const name of expectedVerbValueExports[verb] ?? []) {',
      '    if (!(name in namespace)) throw new Error(`${verb}.${name} runtime export missing`);',
      '  }',
      '  for (const name of expectedVerbTypeOnlyExports[verb] ?? []) {',
      '    if (name in namespace) throw new Error(`${verb}.${name} type-only export leaked at runtime`);',
      '  }',
      '}',
    ].join("\n"),
  );
  await writeFile(
    join(workspace, "smoke.ts"),
    [
      'import * as z from "zod";',
      'import { applyOperation, applyPatch, tryParsePointer, parentPointer, lastSegment, lastSegmentIndex, appendSegment, withLastSegment, type CutError, type DuplicateError, type JSONPatchOperation, type ParseError, type ParseResult, type PasteError, type PatchRequest, type Pointer, type PreFlightErrorCode, type RekeyResult, type ReplaceError } from "zod-crud";',
      'import type { ApplyResult, ClipboardItemMap, ClipboardItemOptions, CopyError, CopyOk, CopyResult, CutOk, DuplicateOk, DuplicateOpts, ErrorCode, FindError, FindOk, JSONLoadOptions, JSONOps, JSONResult, MoveError, MoveOk, MoveResult, PasteDuMismatch, PasteMode, PasteOk, PasteOptions, PointerOf, RecordedStep, Recording, RedoResult, RekeyContext, RekeyOptions, RekeyStrategy, ReplayOptions, SelectionAction, SelectionMode, SelectionSnap, SelectionType, UndoEntry, UndoNoop, UndoResult, UseJSONOptions, ValueAt } from "zod-crud";',
      'const schema = z.object({ name: z.string() });',
      'type PublicRootTypes = [ApplyResult<typeof schema>, ClipboardItemMap, ClipboardItemOptions, CopyError, CopyOk, CopyResult, CutOk<z.output<typeof schema>>, DuplicateOk<z.output<typeof schema>>, DuplicateOpts, ErrorCode, FindError, FindOk, JSONLoadOptions, JSONOps<z.output<typeof schema>>, JSONResult, MoveError, MoveOk<z.output<typeof schema>>, MoveResult<z.output<typeof schema>>, PasteDuMismatch, PasteMode, PasteOk<z.output<typeof schema>>, PasteOptions, PointerOf<z.output<typeof schema>>, RecordedStep, Recording<z.output<typeof schema>>, RedoResult<z.output<typeof schema>, UndoEntry>, RekeyContext, RekeyOptions, RekeyStrategy, ReplayOptions, SelectionAction, SelectionMode, SelectionSnap, SelectionType, UndoEntry, UndoNoop, UndoResult<z.output<typeof schema>, UndoEntry>, UseJSONOptions, ValueAt<z.output<typeof schema>, "/name">];',
      'declare const publicRootTypes: PublicRootTypes;',
      'publicRootTypes satisfies readonly unknown[];',
      'const r = applyOperation(schema, { name: "ok" }, { op: "replace", path: "/name", value: "next" });',
      'r.state.name satisfies string;',
      'const ops: JSONPatchOperation[] = [{ op: "replace", path: "/name", value: "y" }];',
      'const r2 = applyPatch(schema, { name: "ok" }, ops);',
      'r2.state.name satisfies string;',
      'const p: Pointer = "/name";',
      'p satisfies string;',
      'const parsedPointer = tryParsePointer(p);',
      'parsedPointer satisfies string[] | null;',
      'parentPointer(p) satisfies string | null;',
      'lastSegment(p) satisfies string | null;',
      'lastSegmentIndex(p) satisfies number | null;',
      'appendSegment(p, "next") satisfies string;',
      'withLastSegment(p, "other") satisfies string | null;',
      'const req: PatchRequest = { method: "PATCH", headers: { "content-type": "application/json-patch+json" }, body: "[]" };',
      'req.headers satisfies Record<string, string>;',
      'declare const parseResult: ParseResult | ParseError;',
      'parseResult.ok satisfies boolean;',
      'declare const preFlightCode: PreFlightErrorCode;',
      'preFlightCode satisfies "invalid_pointer" | "path_not_found" | "move_into_self" | "schema_violation" | "test_failed" | "not_serializable" | "preFlight_failed";',
      'declare const cutError: CutError;',
      'cutError.code satisfies "path_not_found" | "not_serializable" | "invalid_pointer" | "move_into_self" | "schema_violation" | "test_failed" | "preFlight_failed";',
      'declare const pasteError: PasteError;',
      'pasteError.code satisfies "not_serializable" | "rekey_failed" | "invalid_pointer" | "path_not_found" | "move_into_self" | "schema_violation" | "test_failed" | "preFlight_failed";',
      'type RootRekeyFailure = Extract<RekeyResult, { ok: false }>;',
      'declare const rootRekeyCode: RootRekeyFailure["code"];',
      'rootRekeyCode satisfies "not_serializable" | "rekey_failed";',
      'declare const duplicateError: DuplicateError;',
      'duplicateError.code satisfies "invalid_pointer" | "path_not_found" | "missing_new_key" | "key_conflict" | "not_serializable" | "rekey_failed" | "move_into_self" | "schema_violation" | "test_failed" | "preFlight_failed";',
      'declare const replaceError: ReplaceError;',
      'replaceError.code satisfies "syntax_error" | "empty_match" | "invalid_pointer" | "path_not_found" | "move_into_self" | "schema_violation" | "test_failed" | "not_serializable" | "preFlight_failed";',
    ].join("\n"),
  );
  await writeFile(
    join(workspace, "named-imports-smoke.ts"),
    [
      namedImportLine(rootValueExports, "zod-crud", { prefix: "RootValue_" }),
      namedImportLine(rootTypeExports, "zod-crud", { prefix: "RootType_", typeOnly: true }),
      namedImportLine(reactValueExports, "zod-crud/react", { prefix: "ReactValue_" }),
      namedImportLine(reactTypeExports, "zod-crud/react", { prefix: "ReactType_", typeOnly: true }),
      "const rootValues = {",
      ...rootValueExports.map((name) => `  ${name}: RootValue_${name},`),
      "};",
      "const reactValues = {",
      ...reactValueExports.map((name) => `  ${name}: ReactValue_${name},`),
      "};",
      "rootValues satisfies Record<string, unknown>;",
      "reactValues satisfies Record<string, unknown>;",
    ].filter((line) => line !== null).join("\n"),
  );
  await writeFile(
    join(workspace, "react-smoke.mjs"),
    [
      'import * as zcr from "zod-crud/react";',
      'import { useJSONDocument, useJSON, useSelection, useJSONSlice, useDraft, useField, useRecorder, replayRecording, useDebugLog } from "zod-crud/react";',
      'import { JSONCrudError } from "zod-crud/react";',
      `const expectedReactValueExports = ${JSON.stringify(reactValueExports)};`,
      `const expectedReactTypeOnlyExports = ${JSON.stringify(reactTypeOnlyExports)};`,
      'for (const name of expectedReactValueExports) {',
      '  if (!(name in zcr)) throw new Error(`${name} react runtime export missing`);',
      '}',
      'for (const name of expectedReactTypeOnlyExports) {',
      '  if (name in zcr) throw new Error(`${name} type-only react export leaked at runtime`);',
      '}',
      'if (typeof useJSONDocument !== "function") throw new Error("useJSONDocument export failed");',
      'if (typeof useJSON !== "function") throw new Error("useJSON export failed");',
      'if (typeof useSelection !== "function") throw new Error("useSelection export failed");',
      'if (typeof useJSONSlice !== "function") throw new Error("useJSONSlice export failed");',
      'if (typeof useDraft !== "function") throw new Error("useDraft export failed");',
      'if (typeof useField !== "function") throw new Error("useField export failed");',
      'if (typeof useRecorder !== "function") throw new Error("useRecorder export failed");',
      'if (typeof replayRecording !== "function") throw new Error("replayRecording react export failed");',
      'if (typeof useDebugLog !== "function") throw new Error("useDebugLog export failed");',
      'if (typeof JSONCrudError !== "function") throw new Error("JSONCrudError react export failed");',
    ].join("\n"),
  );
  await writeFile(
    join(workspace, "react-smoke.ts"),
    [
      'import * as z from "zod";',
      'import { JSONCrudError, type DebugLog, type DebugLogApi, type DebugLogger, type DraftFieldState, type DraftState, type JSONDocument, type JSONOps, type RecordedStep, type RecorderApi, type Recording, type ReplayOptions, type SelectionState, type UseSelectionOptions, useDebugLog, useDraft, useField, useJSON, useJSONDocument, useJSONSlice, useSelection } from "zod-crud/react";',
      'const Schema = z.object({ name: z.string() });',
      'type Doc = JSONDocument<z.output<typeof Schema>>;',
      'type Ops = JSONOps<z.output<typeof Schema>>;',
      'useJSONDocument satisfies (schema: typeof Schema, initial: z.output<typeof Schema>) => Doc;',
      'useJSON satisfies (schema: typeof Schema, initial: z.output<typeof Schema>) => [z.output<typeof Schema>, Ops];',
      'useSelection satisfies (ops: Ops, options?: UseSelectionOptions) => SelectionState<z.output<typeof Schema>>;',
      'useJSONSlice satisfies (ops: Ops, pointer: "/name") => string | undefined;',
      'useDebugLog satisfies (ops: Ops) => DebugLogApi<z.output<typeof Schema>>;',
      'useDraft satisfies (doc: Doc) => DraftState<z.output<typeof Schema>>;',
      'useField satisfies (doc: Doc, pointer: "/name") => DraftFieldState<string>;',
      'const _selection = null as unknown as SelectionState<z.output<typeof Schema>>;',
      'const _ops = null as unknown as Ops;',
      'const _draft = null as unknown as DraftState<z.output<typeof Schema>>;',
      'const _draftField = null as unknown as DraftFieldState<string>;',
      'const _log = null as unknown as DebugLog<z.output<typeof Schema>>;',
      'const _logger = null as unknown as DebugLogger;',
      'const _recordedStep = null as unknown as RecordedStep;',
      'const _recorder = null as unknown as RecorderApi<z.output<typeof Schema>>;',
      'const _recording = null as unknown as Recording<z.output<typeof Schema>>;',
      'const _replayOptions = null as unknown as ReplayOptions;',
      '_selection.ranges satisfies readonly string[];',
      '_ops.state.name satisfies string;',
      '_ops.reset() satisfies import("zod-crud").JSONResult;',
      '_draft.pendingPaths satisfies string[];',
      '_draft.field("/name").value satisfies unknown;',
      '_draftField.commit() satisfies import("zod-crud").JSONResult;',
      '_log.initialState.name satisfies string;',
      '_log.events[0]?.kind satisfies string | undefined;',
      '_logger.enabled satisfies boolean;',
      '_recordedStep.ops satisfies readonly import("zod-crud").JSONPatchOperation[];',
      '_recorder.steps satisfies readonly RecordedStep[];',
      '_recording.steps satisfies RecordedStep[];',
      '_replayOptions.speed satisfies number | undefined;',
      'JSONCrudError satisfies typeof import("zod-crud").JSONCrudError;',
    ].join("\n"),
  );
  await writeFile(
    join(workspace, "readme-react-example.tsx"),
    markdownCodeBlockAfterHeading(readmeSource, "React — `useJSONDocument`", "tsx"),
  );

  await writeFile(
    join(workspace, "package.json"),
    JSON.stringify({
      private: true,
      type: "module",
      dependencies: {
        "zod-crud": `file:${tarball}`,
      },
    }, null, 2),
  );

  run("npm", ["install", "--legacy-peer-deps", "--ignore-scripts", "--no-audit", "--no-fund", "--no-package-lock"], workspace);
  await mkdir(join(workspace, "node_modules"), { recursive: true });
  const installedPackageRoot = join(workspace, "node_modules", "zod-crud");
  assertInstalledPackageJson(
    JSON.parse(await readFile(join(installedPackageRoot, "package.json"), "utf8")),
  );
  await assertInstalledTextFiles(installedPackageRoot);
  assertDeclarationExports(
    await readFile(join(installedPackageRoot, "dist", "index.d.ts"), "utf8"),
    rootPublicExports,
    "root",
  );
  assertDeclarationExports(
    await readFile(join(installedPackageRoot, "dist", "react.d.ts"), "utf8"),
    reactPublicExports,
    "react",
  );
  for (const [verb, expectedExports] of Object.entries(verbPublicExports)) {
    assertDeclarationExports(
      await readFile(join(installedPackageRoot, "dist", "verbs", `${verb}.d.ts`), "utf8"),
      expectedExports,
      `verbs/${verb}`,
    );
  }
  await assertDeclarationSpecifiers(installedPackageRoot);
  await assertRuntimeSpecifiers(installedPackageRoot);

  if (!existsSync(join(workspace, "node_modules", "zod"))) {
    await symlink(zodPackage, join(workspace, "node_modules", "zod"), "dir");
  }
  if (existsSync(join(workspace, "node_modules", "react"))) {
    throw new Error("Root package smoke must run before React is installed so the root entrypoint stays headless");
  }

  const privateSubpaths = [
    "package.json",
    "dist/index.js",
    "dist/react.js",
    "src/index.ts",
    "core/patch",
    "hooks/useJSON",
    "sidecars/http",
    "verbs",
  ];
  for (const privateSubpath of privateSubpaths) {
    expectCommandFailure(
      "node",
      ["--input-type=module", "--eval", `await import("zod-crud/${privateSubpath}")`],
      workspace,
      "ERR_PACKAGE_PATH_NOT_EXPORTED",
    );
  }

  run("node", ["smoke.mjs"], workspace);
  run("node", ["verbs-subpath-smoke.mjs"], workspace);
  run(
    "node",
    [
      typeScriptBin,
      "--noEmit",
      "--target",
      "ES2022",
      "--module",
      "NodeNext",
      "--moduleResolution",
      "NodeNext",
      "--strict",
      "--exactOptionalPropertyTypes",
      "--noUncheckedIndexedAccess",
      "smoke.ts",
    ],
    workspace,
  );
  run(
    "node",
    [
      typeScriptBin,
      "--noEmit",
      "--target",
      "ES2022",
      "--module",
      "NodeNext",
      "--moduleResolution",
      "NodeNext",
      "--strict",
      "--exactOptionalPropertyTypes",
      "--noUncheckedIndexedAccess",
      "named-imports-smoke.ts",
    ],
    workspace,
  );
  run(
    "node",
    [
      typeScriptBin,
      "--noEmit",
      "--target",
      "ES2022",
      "--module",
      "NodeNext",
      "--moduleResolution",
      "NodeNext",
      "--strict",
      "--exactOptionalPropertyTypes",
      "--noUncheckedIndexedAccess",
      "verbs-subpath-smoke.ts",
    ],
    workspace,
  );
  run(
    "node",
    [
      typeScriptBin,
      "--noEmit",
      "--target",
      "ES2022",
      "--module",
      "ESNext",
      "--moduleResolution",
      "Bundler",
      "--strict",
      "--exactOptionalPropertyTypes",
      "--noUncheckedIndexedAccess",
      "smoke.ts",
      "named-imports-smoke.ts",
      "verbs-subpath-smoke.ts",
    ],
    workspace,
  );

  if (!existsSync(join(workspace, "node_modules", "react"))) {
    await symlink(reactPackage, join(workspace, "node_modules", "react"), "dir");
  }
  await mkdir(join(workspace, "node_modules", "@types"), { recursive: true });
  if (!existsSync(join(workspace, "node_modules", "@types", "react"))) {
    await symlink(reactTypesPackage, join(workspace, "node_modules", "@types", "react"), "dir");
  }

  run("node", ["react-smoke.mjs"], workspace);
  run(
    "node",
    [
      typeScriptBin,
      "--noEmit",
      "--target",
      "ES2022",
      "--module",
      "NodeNext",
      "--moduleResolution",
      "NodeNext",
      "--strict",
      "--exactOptionalPropertyTypes",
      "--noUncheckedIndexedAccess",
      "react-smoke.ts",
    ],
    workspace,
  );
  run(
    "node",
    [
      typeScriptBin,
      "--noEmit",
      "--target",
      "ES2022",
      "--module",
      "NodeNext",
      "--moduleResolution",
      "NodeNext",
      "--jsx",
      "react-jsx",
      "--strict",
      "--exactOptionalPropertyTypes",
      "--noUncheckedIndexedAccess",
      "readme-react-example.tsx",
    ],
    workspace,
  );
  run(
    "node",
    [
      typeScriptBin,
      "--noEmit",
      "--target",
      "ES2022",
      "--module",
      "ESNext",
      "--moduleResolution",
      "Bundler",
      "--strict",
      "--exactOptionalPropertyTypes",
      "--noUncheckedIndexedAccess",
      "react-smoke.ts",
    ],
    workspace,
  );
  run(
    "node",
    [
      typeScriptBin,
      "--noEmit",
      "--target",
      "ES2022",
      "--module",
      "ESNext",
      "--moduleResolution",
      "Bundler",
      "--jsx",
      "react-jsx",
      "--strict",
      "--exactOptionalPropertyTypes",
      "--noUncheckedIndexedAccess",
      "readme-react-example.tsx",
    ],
    workspace,
  );
} finally {
  await rm(workspace, { force: true, recursive: true });
}
