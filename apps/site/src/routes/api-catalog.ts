// SPEC §5 — canonical public surface enumeration for the API reference.
// 정본은 packages/zod-crud/SPEC.md §5. 코드 분기점은 src 안의 모듈 4개뿐.

import { listPackagePaths } from "./source-registry";

export type ApiSource = { path: string; symbols?: string[] };
export type ApiEntry = { id: string; call: string; sources: ApiSource[] };
export type ApiGroup = { title: string; apis: ApiEntry[] };
export type ApiId = string;

const HOOK_SRC: ApiSource = { path: "useJson.ts" };
const PATCH_SRC: ApiSource = { path: "core/patch.ts" };
const POINTER_SRC: ApiSource = { path: "core/pointer.ts" };
const SERIALIZE_SRC: ApiSource = { path: "core/serialize.ts" };
const TYPES_SRC: ApiSource = { path: "core/path-types.ts" };

const groups: ApiGroup[] = [
  {
    title: "React hook",
    apis: [
      { id: "useJson", call: "useJson(schema, initial, options?)", sources: [HOOK_SRC] },
    ],
  },
  {
    title: "RFC 6902 — JsonOps",
    apis: [
      { id: "ops.add", call: "ops.add(path, value)", sources: [HOOK_SRC, PATCH_SRC] },
      { id: "ops.remove", call: "ops.remove(path)", sources: [HOOK_SRC, PATCH_SRC] },
      { id: "ops.replace", call: "ops.replace(path, value)", sources: [HOOK_SRC, PATCH_SRC] },
      { id: "ops.move", call: "ops.move(from, path)", sources: [HOOK_SRC, PATCH_SRC] },
      { id: "ops.copy", call: "ops.copy(from, path)", sources: [HOOK_SRC, PATCH_SRC] },
      { id: "ops.test", call: "ops.test(path, value)", sources: [HOOK_SRC, PATCH_SRC] },
      { id: "ops.patch", call: "ops.patch(operations)", sources: [HOOK_SRC, PATCH_SRC] },
    ],
  },
  {
    title: "History & lifecycle",
    apis: [
      { id: "ops.undo", call: "ops.undo()", sources: [HOOK_SRC] },
      { id: "ops.redo", call: "ops.redo()", sources: [HOOK_SRC] },
      { id: "ops.canUndo", call: "ops.canUndo()", sources: [HOOK_SRC] },
      { id: "ops.canRedo", call: "ops.canRedo()", sources: [HOOK_SRC] },
      { id: "ops.load", call: "ops.load(value)", sources: [HOOK_SRC] },
      { id: "ops.reset", call: "ops.reset(value?)", sources: [HOOK_SRC] },
    ],
  },
  {
    title: "Pure core (no React)",
    apis: [
      { id: "applyOperation", call: "applyOperation(schema, state, op)", sources: [PATCH_SRC] },
      { id: "applyPatch", call: "applyPatch(schema, state, ops)", sources: [PATCH_SRC] },
    ],
  },
  {
    title: "RFC 6901 — Pointer",
    apis: [
      { id: "parsePointer", call: "parsePointer(pointer)", sources: [POINTER_SRC] },
      { id: "buildPointer", call: "buildPointer(segments)", sources: [POINTER_SRC] },
      { id: "escapeSegment", call: "escapeSegment(s)", sources: [POINTER_SRC] },
      { id: "unescapeSegment", call: "unescapeSegment(s)", sources: [POINTER_SRC] },
      { id: "PointerOf", call: "type PointerOf<T>", sources: [TYPES_SRC] },
      { id: "ValueAt", call: "type ValueAt<T, P>", sources: [TYPES_SRC] },
    ],
  },
  {
    title: "JSON helpers",
    apis: [
      { id: "serialize", call: "serialize(state)", sources: [SERIALIZE_SRC] },
      { id: "parse", call: "parse(schema, json)", sources: [SERIALIZE_SRC] },
      { id: "safeParse", call: "safeParse(schema, json)", sources: [SERIALIZE_SRC] },
    ],
  },
];

function validate(): void {
  const known = new Set(listPackagePaths());
  const missing: string[] = [];
  for (const g of groups) {
    for (const api of g.apis) {
      for (const src of api.sources) {
        if (!known.has(src.path)) missing.push(`${g.title}/${api.id} → ${src.path}`);
      }
    }
  }
  if (missing.length > 0) {
    throw new Error(`api-catalog: ${missing.length} broken source path(s):\n  ${missing.join("\n  ")}`);
  }
}

export const apiGroups: ApiGroup[] = (() => {
  validate();
  return groups;
})();
