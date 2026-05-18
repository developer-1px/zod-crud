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
const verbEntries = await readdir(join(repoRoot, "src", "verbs"), { withFileTypes: true });
const verbNames = verbEntries
  .filter((entry) => entry.isFile() && extname(entry.name) === ".ts")
  .map((entry) => basename(entry.name, ".ts"))
  .sort();

function run(command, args, cwd) {
  execFileSync(command, args, {
    cwd,
    env: { ...process.env, npm_config_cache: npmCache },
    stdio: "pipe",
  });
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

function existingPath(candidates) {
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
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

  if (!existsSync(tarball)) {
    throw new Error(`Packed tarball was not created: ${tarball}`);
  }

  // #62 guard — published tarball 에 node_modules 가 포함되면 소비자 측 zod type 중복으로 generic 추론이 깨진다.
  const packedFiles = (packResult.files ?? []).map((f) => f.path);
  const offenders = packedFiles.filter((p) => p.includes("node_modules/"));
  if (offenders.length > 0) {
    throw new Error(`Tarball must not include node_modules: ${offenders.slice(0, 3).join(", ")}`);
  }
  for (const required of ["LICENSE", "README.md", "SPEC.md", "CHANGELOG.md", "package.json"]) {
    if (!packedFiles.includes(required)) {
      throw new Error(`Tarball is missing required package file: ${required}`);
    }
  }
  if (packageJson.type !== "module") {
    throw new Error('Package must publish as ESM with "type": "module"');
  }
  if (packageJson.sideEffects !== false) {
    throw new Error('Package must declare "sideEffects": false');
  }
  if (packageJson.main !== packageJson.exports["."].import) {
    throw new Error(`Package main must match root import export: ${packageJson.main}`);
  }
  if (packageJson.types !== packageJson.exports["."].types) {
    throw new Error(`Package types must match root types export: ${packageJson.types}`);
  }
  for (const [subpath, exportMap] of Object.entries(packageJson.exports)) {
    const conditions = Object.keys(exportMap);
    const expectedConditions = ["types", "development", "import"];
    if (JSON.stringify(conditions) !== JSON.stringify(expectedConditions)) {
      throw new Error(`Export ${subpath} conditions must be ${expectedConditions.join(",")}: ${conditions.join(",")}`);
    }
    for (const condition of ["types", "import"]) {
      const target = exportMap[condition];
      const packedPath = target.replace(/^\.\//, "");
      if (!packedFiles.includes(packedPath)) {
        throw new Error(`Export ${subpath}.${condition} target is missing from tarball: ${target}`);
      }
    }
    const developmentTarget = exportMap.development;
    if (!existsSync(join(repoRoot, developmentTarget.replace(/^\.\//, "")))) {
      throw new Error(`Export ${subpath}.development target is missing from source: ${developmentTarget}`);
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
  const verbFunctionChecks = exportedVerbs.map((name) => `${name} satisfies Function;`);
  const verbRuntimeImportLines = exportedVerbs.map((name) => `import { ${name} } from "zod-crud/verbs/${name}";`);
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

  await writeFile(
    join(workspace, "package.json"),
    JSON.stringify({ private: true }, null, 2),
  );
  await writeFile(
    join(workspace, "smoke.mjs"),
    [
      'import * as z from "zod";',
      'import { applyOperation, applyPatch, parsePointer, buildPointer, find, replace } from "zod-crud";',
      'import { move } from "zod-crud/verbs/move";',
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
      'if (buildPointer(["a", 0]) !== "/a/0") throw new Error("buildPointer failed");',
      'if (!find(r2.state, "$.tags[0]").ok) throw new Error("find export failed");',
      'if (!replace(schema, r2.state, "$.name", "z").ok) throw new Error("replace export failed");',
      'if (!move(schema, r2.state, "/tags/0", "/tags/0").ok) throw new Error("verb subpath export failed");',
    ].join("\n"),
  );
  await writeFile(
    join(workspace, "verbs-subpath-smoke.ts"),
    [
      ...verbImportLines,
      ...verbFunctionChecks,
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
      `const exports = { ${verbRuntimeEntries} };`,
      'for (const [name, value] of Object.entries(exports)) {',
      '  if (typeof value !== "function") throw new Error(`${name} subpath export failed`);',
      '}',
    ].join("\n"),
  );
  await writeFile(
    join(workspace, "smoke.ts"),
    [
      'import * as z from "zod";',
      'import { applyOperation, applyPatch, type CutError, type DuplicateError, type JSONPatchOperation, type PasteError, type Pointer, type PreFlightErrorCode, type RekeyResult, type ReplaceError } from "zod-crud";',
      'const schema = z.object({ name: z.string() });',
      'const r = applyOperation(schema, { name: "ok" }, { op: "replace", path: "/name", value: "next" });',
      'r.state.name satisfies string;',
      'const ops: JSONPatchOperation[] = [{ op: "replace", path: "/name", value: "y" }];',
      'const r2 = applyPatch(schema, { name: "ok" }, ops);',
      'r2.state.name satisfies string;',
      'const p: Pointer = "/name";',
      'p satisfies string;',
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
    join(workspace, "react-smoke.mjs"),
    [
      'import { useJSONDocument, useJSON, useSelection, useRecorder, replayRecording, useDebugLog } from "zod-crud/react";',
      'import { JSONCrudError } from "zod-crud/react";',
      'if (typeof useJSONDocument !== "function") throw new Error("useJSONDocument export failed");',
      'if (typeof useJSON !== "function") throw new Error("useJSON export failed");',
      'if (typeof useSelection !== "function") throw new Error("useSelection export failed");',
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
      'import { JSONCrudError, type DebugLog, type DebugLogger, type JSONDocument, type JSONOps, type SelectionState, useDebugLog, useJSON, useJSONDocument } from "zod-crud/react";',
      'const Schema = z.object({ name: z.string() });',
      'type Doc = JSONDocument<z.output<typeof Schema>>;',
      'type Ops = JSONOps<z.output<typeof Schema>>;',
      'useJSONDocument satisfies (schema: typeof Schema, initial: z.output<typeof Schema>) => Doc;',
      'useJSON satisfies (schema: typeof Schema, initial: z.output<typeof Schema>) => [z.output<typeof Schema>, Ops];',
      'useDebugLog satisfies (ops: Ops) => DebugLogger;',
      'const _selection = null as unknown as SelectionState<z.output<typeof Schema>>;',
      'const _ops = null as unknown as Ops;',
      'const _log = null as unknown as DebugLog<z.output<typeof Schema>>;',
      '_selection.ranges satisfies readonly string[];',
      '_ops.state.name satisfies string;',
      '_ops.reset() satisfies import("zod-crud").JSONResult;',
      '_log.initialState.name satisfies string;',
      '_log.events[0]?.kind satisfies string | undefined;',
      'JSONCrudError satisfies typeof import("zod-crud").JSONCrudError;',
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

  if (!existsSync(join(workspace, "node_modules", "zod"))) {
    await symlink(zodPackage, join(workspace, "node_modules", "zod"), "dir");
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
      "verbs-subpath-smoke.ts",
    ],
    workspace,
  );

  if (!existsSync(join(workspace, "node_modules", "react"))) {
    await symlink(reactPackage, join(workspace, "node_modules", "react"), "dir");
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
      "react-smoke.ts",
    ],
    workspace,
  );
} finally {
  await rm(workspace, { force: true, recursive: true });
}
