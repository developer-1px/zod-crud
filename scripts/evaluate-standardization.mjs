import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function requirePattern(name, source, pattern) {
  if (!pattern.test(source)) fail(`${name}: missing ${pattern}.`);
}

const standard = read("docs/standard/core-standard.md");
const foundationGate = read("docs/standard/foundation-gate.md");
const resultContract = read("docs/standard/result-contract.md");
const selectionContract = read("docs/standard/selection-contract.md");
const schemaIntrospectionContract = read("docs/standard/schema-introspection-contract.md");
const conformance = read("packages/json-document/tests/public/standard-conformance.test.ts");
const publicContract = JSON.parse(read("packages/json-document/public-contract.json"));
const rootPackage = JSON.parse(read("package.json"));

for (const [label, pattern] of [
  ["normative language", /\bMUST\b[\s\S]*\bSHOULD\b[\s\S]*\bMAY\b/],
  ["conformance classes", /## 3\. 적합성 등급/],
  ["data model", /## 4\. 데이터 모델/],
  ["pointer-query-mutation distinction", /JSONPath는 mutation target으로 받아들이면 안 된다/],
  ["schema semantics", /## 6\. Schema 의미론/],
  ["document surface", /find[\s\S]*insert[\s\S]*replace[\s\S]*delete[\s\S]*move[\s\S]*duplicate[\s\S]*copy[\s\S]*cut[\s\S]*paste[\s\S]*undo[\s\S]*redo[\s\S]*canFind[\s\S]*canInsert[\s\S]*canRedo/],
  ["strict semantics", /기본값은 `strict: false`/],
  ["selection semantics", /selection은 DOM focus가 아니라 headless document data다/],
  ["clipboard spread", /직접 `paste\(target, \{ payload \}\)`에 array payload를 넘긴 경우 기본적으로[\s\S]*spread하면 안/],
  ["history semantics", /history는 undo\/redo control surface/],
  ["breaking change", /breaking change로\s+취급해야 한다/],
  ["adapter pressure", /form editing[\s\S]*storage, history, collaboration bridge/],
  ["conformance", /적합성 suite는 public package entrypoint에서만 import해야 한다/],
]) {
  requirePattern("core standard", standard, pattern);
}

for (const token of [
  "src/index.ts",
  "src/react.ts",
  "application/document",
  "domain/schema",
  "domain/selection",
  "foundation/patch",
  "foundation/json",
  "foundation/pointer",
]) {
  if (standard.includes(token)) fail(`core standard: internal source path leaked: ${token}.`);
}

for (const [label, pattern] of [
  ["foundation tree", /RFC급 foundation/],
  ["normative artifact", /core-standard\.md/],
  ["result freeze artifact", /result-contract\.md/],
  ["selection freeze artifact", /selection-contract\.md/],
  ["schema freeze artifact", /schema-introspection-contract\.md/],
  ["conformance artifact", /standard-conformance\.test\.ts/],
  ["evaluator artifact", /evaluate-standardization\.mjs/],
  ["adapter pressure", /form[\s\S]*table\/data-grid[\s\S]*outliner\/tree[\s\S]*rich text[\s\S]*storage\/collaboration/i],
]) {
  requirePattern("foundation gate", foundationGate, pattern);
}

for (const [label, pattern] of [
  ["json result shape", /## JSONResult[\s\S]*invalid_pointer[\s\S]*schema_violation/],
  ["capability result shape", /## JSONCapabilityResult[\s\S]*CapabilityErrorCode[\s\S]*violations\[\]\.path/],
  ["preflight and clipboard codes", /preflight_failed[\s\S]*empty_clipboard/],
  ["schema violation path modes", /schema-slot[\s\S]*document-result/],
  ["breaking changes", /## Breaking Change[\s\S]*error code/],
]) {
  requirePattern("result contract", resultContract, pattern);
}

for (const [label, pattern] of [
  ["selection mode", /## SelectionMode[\s\S]*`single`[\s\S]*`multiple`[\s\S]*`extended`/],
  ["selection snap", /## SelectionSnap[\s\S]*selectedPointers[\s\S]*selectionRanges[\s\S]*primaryIndex/],
  ["selection after", /selectionAfter[\s\S]*history entry/],
  ["text edit codes", /missing_length[\s\S]*multi_pointer_range[\s\S]*overlapping_ranges[\s\S]*not_string/],
  ["non-goals", /DOM focus[\s\S]*2D marquee[\s\S]*stable object id resolver/],
]) {
  requirePattern("selection contract", selectionContract, pattern);
}

for (const [label, pattern] of [
  ["schema state", /## SchemaState[\s\S]*accepts/],
  ["path mode", /SchemaPathMode[\s\S]*`value`[\s\S]*`insert`/],
  ["schema kind", /SchemaKind[\s\S]*discriminatedUnion[\s\S]*nullable/],
  ["description", /SchemaDescription[\s\S]*jsonSchema[\s\S]*discriminator/],
  ["schema slot result", /schema-slot[\s\S]*document-result/],
  ["capability result", /JSONCapabilityResult[\s\S]*schema_violation/],
]) {
  requirePattern("schema introspection contract", schemaIntrospectionContract, pattern);
}

if (!/from "@interactive-os\/json-document"/.test(conformance)) {
  fail("standard conformance: must import from the public root package.");
}
if (/from "\.\.|from '\.\.|\/src\//.test(conformance)) {
  fail("standard conformance: must not import implementation-private modules.");
}
for (const [label, pattern] of [
  ["jsonpath query", /query\("\$\.columns\[\*\]\.cards\[\*\]\.id"\)/],
  ["json pointer mutation", /path: "\/columns\/0\/cards\/0\/title"/],
  ["capability purity", /keeps capability probes reasoned and mutation-free/],
  ["selection history", /commits patch and final selection as one history step/],
  ["clipboard spread", /explicit about spread/],
  ["subscriber atomicity", /only after successful atomic changes/],
]) {
  requirePattern("standard conformance", conformance, pattern);
}

if (!publicContract.root.values.includes("createJSONDocument")) {
  fail("public contract: missing createJSONDocument.");
}
if (!publicContract.react.values.includes("useJSONDocument")) {
  fail("public contract: missing useJSONDocument.");
}
for (const requiredType of [
  "JSONDocument",
  "JSONCapabilityResult",
  "SelectionSnap",
  "ClipboardPasteResult",
  "JSONDocumentHistory",
]) {
  if (!publicContract.root.types.includes(requiredType)) {
    fail(`public contract: missing ${requiredType}.`);
  }
}

if (!rootPackage.scripts?.["standard:check"]) {
  fail("package scripts: missing standard:check.");
}
if (!rootPackage.scripts?.["release:check"]?.includes("standard:check")) {
  fail("package scripts: release:check must include standard:check.");
}

const libraryPackage = JSON.parse(read("packages/json-document/package.json"));
if (!libraryPackage.files?.includes("public-contract.json")) {
  fail("json-document package: public-contract.json must be published with the package.");
}
