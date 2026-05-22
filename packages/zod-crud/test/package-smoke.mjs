import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const monorepoRoot = resolve(repoRoot, "..", "..");
const workspace = await mkdtemp(join(tmpdir(), "zod-crud-package-"));
const npmCache = join(workspace, ".npm-cache");
const npmEnv = { ...process.env, npm_config_cache: npmCache, npm_config_package_lock: "false" };
const lockfilePath = join(monorepoRoot, "package-lock.json");
const lockfileSnapshot = existsSync(lockfilePath) ? await readFile(lockfilePath) : null;
const packageJson = JSON.parse(await readFile(join(repoRoot, "package.json"), "utf8"));
const readmeSource = await readFile(join(repoRoot, "README.md"), "utf8");
const rootValueExports = [
  "JSONCrudError",
  "PointerSyntaxError",
  "appendSegment",
  "applyOperation",
  "applyPatch",
  "applyPatchToTrustedState",
  "buildPointer",
  "createJSONDocument",
  "escapeSegment",
  "lastSegment",
  "lastSegmentIndex",
  "parentPointer",
  "parsePointer",
  "trackPointer",
  "tryParsePointer",
  "unescapeSegment",
  "withLastSegment",
];
const reactValueExports = ["useJSONDocument"];
const rootPublicExports = [
  ...rootValueExports,
  "HistoryTransactionOptions",
  "JSONCapabilityResult",
  "JSONChangeMetadata",
  "JSONDocument",
  "JSONDocumentCommitOptions",
  "JSONDocumentDuplicateOptions",
  "JSONDocumentDuplicateResult",
  "JSONDocumentHistory",
  "JSONDocumentPasteOptions",
  "JSONDocumentPasteTarget",
  "JSONPatchInput",
  "JSONPatchOperation",
  "JSONPoint",
  "JSONResult",
  "Pointer",
  "SelectionAction",
  "SelectionRange",
  "SelectionSnap",
  "SelectionState",
];
const reactPublicExports = [...reactValueExports];
const rootTypeExports = rootPublicExports.filter((name) => !rootValueExports.includes(name));
const reactTypeExports = reactPublicExports.filter((name) => !reactValueExports.includes(name));
const rootTypeOnlyExports = [...rootTypeExports];
const reactTypeOnlyExports = [...reactTypeExports];

function run(command, args, cwd) {
  try {
    execFileSync(command, args, {
      cwd,
      env: npmEnv,
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
      env: npmEnv,
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

function markdownCodeBlockAfterHeading(source, heading, language) {
  const rest = markdownSection(source, heading);
  const match = rest.match(new RegExp(`\`\`\`${language}\\n([\\s\\S]*?)\\n\`\`\``));
  if (!match?.[1]) throw new Error(`README ${heading} ${language} code block missing`);
  return match[1];
}

function markdownSection(source, heading) {
  const headingIndex = source.indexOf(`## ${heading}`);
  if (headingIndex === -1) throw new Error(`README heading missing: ${heading}`);
  const rest = source.slice(headingIndex);
  const nextHeadingIndex = rest.slice(1).search(/\n## /);
  return nextHeadingIndex === -1 ? rest : rest.slice(0, nextHeadingIndex + 1);
}

function markdownCodeBlocksAfterHeading(source, heading, language) {
  const section = markdownSection(source, heading);
  const blocks = Array.from(
    section.matchAll(new RegExp(`\`\`\`${language}\\n([\\s\\S]*?)\\n\`\`\``, "g")),
    (match) => {
      const block = match[1];
      if (block === undefined) throw new Error(`README ${heading} ${language} code block capture failed`);
      return block;
    },
  );
  if (blocks.length === 0) throw new Error(`README ${heading} has no ${language} code blocks`);
  return blocks;
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
      env: npmEnv,
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
      'import { applyOperation, applyPatch, applyPatchToTrustedState, createJSONDocument, parsePointer, tryParsePointer, buildPointer, parentPointer, lastSegment, lastSegmentIndex, appendSegment, withLastSegment } from "zod-crud";',
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
      'const r3 = applyPatchToTrustedState(schema, initial, [{ op: "replace", path: "/name", value: "trusted" }]);',
      'if (!r3.result.ok || r3.state.name !== "trusted") throw new Error("applyPatchToTrustedState failed");',
      'if (parsePointer("/a/0").length !== 2) throw new Error("parsePointer failed");',
      'if (tryParsePointer("/a/0")?.length !== 2) throw new Error("tryParsePointer valid failed");',
      'if (tryParsePointer("a/0") !== null) throw new Error("tryParsePointer invalid failed");',
      'if (buildPointer(["a", 0]) !== "/a/0") throw new Error("buildPointer failed");',
      'if (parentPointer("/a/0") !== "/a") throw new Error("parentPointer failed");',
      'if (lastSegment("/a/0") !== "0") throw new Error("lastSegment failed");',
      'if (lastSegmentIndex("/a/0") !== 0) throw new Error("lastSegmentIndex failed");',
      'if (appendSegment("/a", "b/c") !== "/a/b~1c") throw new Error("appendSegment failed");',
      'if (withLastSegment("/a/0", 1) !== "/a/1") throw new Error("withLastSegment failed");',
      'if (typeof createJSONDocument !== "function") throw new Error("createJSONDocument export failed");',
      'const jsonDoc = createJSONDocument(schema, initial);',
      'const jsonPatch = jsonDoc.patch({ op: "replace", path: "/name", value: "json" });',
      'if (!jsonPatch.ok || jsonDoc.value.name !== "json") throw new Error("createJSONDocument runtime failed");',
      'if (!jsonDoc.at("/name").ok) throw new Error("createJSONDocument read facade failed");',
      'const BoardSchema = z.object({ lists: z.array(z.object({ cards: z.array(z.object({ id: z.string(), title: z.string(), done: z.boolean() })) })) });',
      'const boardDoc = createJSONDocument(BoardSchema, { lists: [{ cards: [{ id: "a", title: "A", done: false }, { id: "b", title: "B", done: false }] }] }, { history: 10, selection: { mode: "extended", initial: ["/lists/0/cards/0"] } });',
      'const foundCards = boardDoc.query("$.lists[*].cards[*]");',
      'if (!foundCards.ok || foundCards.pointers.length !== 2) throw new Error("public interface query failed");',
      'boardDoc.selection?.selectRanges(foundCards.pointers);',
      'if (boardDoc.selection?.selectedPointers.length !== 2) throw new Error("public interface selection failed");',
      'if (!boardDoc.canCopy(boardDoc.selection?.selectedPointers ?? []).ok) throw new Error("public interface canCopy failed");',
      'const copiedCards = boardDoc.clipboard.copy(boardDoc.selection?.selectedPointers ?? []);',
      'if (!copiedCards.ok || !boardDoc.clipboard.hasData) throw new Error("public interface clipboard copy failed");',
      'const pastedCards = boardDoc.clipboard.paste("/lists/0/cards/-", { spread: true, rekey: { fields: ["id"], strategy: "suffix" } });',
      'if (!pastedCards.ok || boardDoc.value.lists[0]?.cards.length !== 4) throw new Error("public interface clipboard paste failed");',
      'const duplicatedCard = boardDoc.duplicate("/lists/0/cards/0", { rekey: { fields: ["id"], strategy: "suffix" } });',
      'if (!duplicatedCard.ok || boardDoc.value.lists[0]?.cards.length !== 5) throw new Error("public interface duplicate failed");',
      'if (!boardDoc.canUndo().ok || !boardDoc.history.undo()) throw new Error("public interface history failed");',
    ].join("\n"),
  );
  await writeFile(
    join(workspace, "smoke.ts"),
    [
      'import * as z from "zod";',
      'import { applyOperation, applyPatch, applyPatchToTrustedState, tryParsePointer, parentPointer, lastSegment, lastSegmentIndex, appendSegment, withLastSegment, type JSONPatchOperation, type Pointer } from "zod-crud";',
      'import type { HistoryTransactionOptions, JSONCapabilityResult, JSONChangeMetadata, JSONDocument, JSONDocumentCommitOptions, JSONDocumentDuplicateOptions, JSONDocumentDuplicateResult, JSONDocumentHistory, JSONDocumentPasteOptions, JSONDocumentPasteTarget, JSONPatchInput, JSONPoint, JSONResult, SelectionAction, SelectionRange, SelectionSnap, SelectionSource, SelectionState } from "zod-crud";',
      'const schema = z.object({ name: z.string() });',
      'type PublicRootTypes = [HistoryTransactionOptions, JSONCapabilityResult, JSONChangeMetadata, JSONDocument<z.output<typeof schema>>, JSONDocumentCommitOptions, JSONDocumentDuplicateOptions, JSONDocumentDuplicateResult<z.output<typeof schema>>, JSONDocumentHistory, JSONDocumentPasteOptions, JSONDocumentPasteTarget, JSONPatchInput, JSONPoint, JSONResult, SelectionAction, SelectionRange, SelectionSnap, SelectionSource, SelectionState];',
      'declare const publicRootTypes: PublicRootTypes;',
      'publicRootTypes satisfies readonly unknown[];',
      'const r = applyOperation(schema, { name: "ok" }, { op: "replace", path: "/name", value: "next" });',
      'r.state.name satisfies string;',
      'const ops: JSONPatchOperation[] = [{ op: "replace", path: "/name", value: "y" }];',
      'const r2 = applyPatch(schema, { name: "ok" }, ops);',
      'r2.state.name satisfies string;',
      'const r3 = applyPatchToTrustedState(schema, { name: "ok" }, ops);',
      'r3.state.name satisfies string;',
      'const _selection = null as unknown as SelectionState;',
      '_selection.subscribe((_snapshot, _previous) => undefined) satisfies () => void;',
      '_selection.togglePointer("/name") satisfies void;',
      '_selection.selectionRanges satisfies readonly SelectionRange[];',
      '_selection.type satisfies "None" | "Caret" | "Range";',
      'const pasteTargetPointer: JSONDocumentPasteTarget = "/items/-";',
      'const pasteTargetAfter: JSONDocumentPasteTarget = { after: "/items/0" };',
      'const pasteTargetBefore: JSONDocumentPasteTarget = { before: "/items/0" };',
      'const pasteTargetReplace: JSONDocumentPasteTarget = { replace: "/items/0" };',
      'pasteTargetPointer satisfies string;',
      'pasteTargetAfter satisfies { after: string };',
      'pasteTargetBefore satisfies { before: string };',
      'pasteTargetReplace satisfies { replace: string };',
      '// @ts-expect-error { at } is intentionally not a public paste target; pass the insertion pointer directly.',
      'const pasteTargetAt: JSONDocumentPasteTarget = { at: "/items/-" };',
      'const p: Pointer = "/name";',
      'p satisfies string;',
      'const parsedPointer = tryParsePointer(p);',
      'parsedPointer satisfies string[] | null;',
      'parentPointer(p) satisfies string | null;',
      'lastSegment(p) satisfies string | null;',
      'lastSegmentIndex(p) satisfies number | null;',
      'appendSegment(p, "next") satisfies string;',
      'withLastSegment(p, "other") satisfies string | null;',
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
      'import { useJSONDocument } from "zod-crud/react";',
      `const expectedReactValueExports = ${JSON.stringify(reactValueExports)};`,
      `const expectedReactTypeOnlyExports = ${JSON.stringify(reactTypeOnlyExports)};`,
      'for (const name of expectedReactValueExports) {',
      '  if (!(name in zcr)) throw new Error(`${name} react runtime export missing`);',
      '}',
      'for (const name of expectedReactTypeOnlyExports) {',
      '  if (name in zcr) throw new Error(`${name} type-only react export leaked at runtime`);',
      '}',
      'if (typeof useJSONDocument !== "function") throw new Error("useJSONDocument export failed");',
    ].join("\n"),
  );
  await writeFile(
    join(workspace, "react-smoke.ts"),
    [
      'import * as z from "zod";',
      'import type { JSONDocument } from "zod-crud";',
      'import { useJSONDocument } from "zod-crud/react";',
      'const Schema = z.object({ name: z.string() });',
      'type Value = z.output<typeof Schema>;',
      'type Doc = JSONDocument<Value>;',
      'const doc = useJSONDocument(Schema, { name: "ok" }, { history: 1 });',
      'doc satisfies Doc;',
    ].join("\n"),
  );
  await writeFile(
    join(workspace, "readme-react-example.tsx"),
    markdownCodeBlockAfterHeading(readmeSource, "React — `useJSONDocument`", "tsx"),
  );
  const readmeTypeScriptExamplePaths = [];
  const readmePureCoreExamples = markdownCodeBlocksAfterHeading(readmeSource, "Pure core (no React)", "ts");
  const readmeSerializationExamples = markdownCodeBlocksAfterHeading(readmeSource, "Serialization", "ts");
  if (readmePureCoreExamples.length !== 1 || readmeSerializationExamples.length !== 2) {
    throw new Error(
      `README package smoke must cover 1 pure core and 2 serialization TypeScript examples: pure=${readmePureCoreExamples.length} serialization=${readmeSerializationExamples.length}`,
    );
  }
  const readmeTypeScriptExamples = [...readmePureCoreExamples, ...readmeSerializationExamples];
  for (const [index, block] of readmeTypeScriptExamples.entries()) {
    const filename = `readme-typescript-example-${index + 1}.ts`;
    readmeTypeScriptExamplePaths.push(filename);
    await writeFile(join(workspace, filename), block);
  }
  const [readmePureCoreExample] = readmePureCoreExamples;
  const [readmeSerializationExample] = readmeSerializationExamples;
  if (readmePureCoreExample === undefined || readmeSerializationExample === undefined) {
    throw new Error("README runtime examples missing from package smoke");
  }
  await writeFile(
    join(workspace, "readme-pure-core-example.mjs"),
    [
      readmePureCoreExample,
      'if (!r.result.ok) throw new Error("README pure core example did not apply");',
      'if (r.state.title !== "final" || r.state.tags[0] !== "docs") throw new Error("README pure core example state mismatch");',
    ].join("\n"),
  );
  await writeFile(
    join(workspace, "readme-serialization-example.mjs"),
    [
      readmeSerializationExample,
      'if (json !== JSON.stringify(state)) throw new Error("README serialization example JSON mismatch");',
      'if (restored.title !== "draft") throw new Error("README serialization example parse mismatch");',
      'if (!safe.success || safe.data.title !== "draft") throw new Error("README serialization example safeParse mismatch");',
    ].join("\n"),
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
    "src/react.ts",
    "src/application/document/createJSONDocument.js",
    "src/domain/verbs",
    "src/domain/verbs/duplicate.js",
    "src/domain/verbs/move.js",
    "src/foundation/json-patch",
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
  run("node", ["readme-pure-core-example.mjs"], workspace);
  run("node", ["readme-serialization-example.mjs"], workspace);
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
      ...readmeTypeScriptExamplePaths,
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
      "ESNext",
      "--moduleResolution",
      "Bundler",
      "--strict",
      "--exactOptionalPropertyTypes",
      "--noUncheckedIndexedAccess",
      ...readmeTypeScriptExamplePaths,
      "smoke.ts",
      "named-imports-smoke.ts",
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
  if (lockfileSnapshot === null) {
    await rm(lockfilePath, { force: true });
  } else {
    await writeFile(lockfilePath, lockfileSnapshot);
  }
  await rm(workspace, { force: true, recursive: true });
}
