// SSOT: 라이브러리 소스 그대로 — 문서가 코드보다 뒤처질 수 없다.
import indexSrc from "../../../../packages/zod-crud/src/index.ts?raw";
import typesSrc from "../../../../packages/zod-crud/src/types.ts?raw";
import jsonCrudSrc from "../../../../packages/zod-crud/src/editor/json-crud.ts?raw";
import jsonPasteSrc from "../../../../packages/zod-crud/src/editor/json-paste.ts?raw";
import jsonDocSrc from "../../../../packages/zod-crud/src/document/json-doc.ts?raw";
import opResultSrc from "../../../../packages/zod-crud/src/editor/operation-result.ts?raw";
import jsonValidationSrc from "../../../../packages/zod-crud/src/schema/json-validation.ts?raw";

export type ApiId =
  | "createJsonCrud" | "serialize" | "deserialize" | "getPath"
  | "snapshot" | "toJson" | "read" | "pathOf" | "find"
  | "create" | "insertAfter" | "insertBefore" | "appendChild"
  | "update" | "rename" | "delete" | "deleteMany"
  | "copy" | "copyMany" | "cut" | "cutMany" | "paste"
  | "canCopyMany" | "canCutMany" | "canDeleteMany" | "canPaste" | "canUndo" | "canRedo"
  | "subscribe" | "undo" | "redo";

export type SourceKey =
  | "index" | "types" | "json-crud" | "json-paste" | "json-doc" | "op-result" | "validation";

export type ApiEntry = {
  id: ApiId;
  label: string;
  call: string;
  sourceKey: SourceKey;
  symbols: string[];
};

export type ApiGroup = {
  title: string;
  apis: ApiEntry[];
};

export const sourceMap: Record<SourceKey, { filename: string; source: string }> = {
  "index": { filename: "index.ts", source: indexSrc },
  "types": { filename: "types.ts", source: typesSrc },
  "json-crud": { filename: "editor/json-crud.ts", source: jsonCrudSrc },
  "json-paste": { filename: "editor/json-paste.ts", source: jsonPasteSrc },
  "json-doc": { filename: "document/json-doc.ts", source: jsonDocSrc },
  "op-result": { filename: "editor/operation-result.ts", source: opResultSrc },
  "validation": { filename: "schema/json-validation.ts", source: jsonValidationSrc },
};

export const apiGroups: ApiGroup[] = [
  {
    title: "Factory",
    apis: [
      { id: "createJsonCrud", label: "createJsonCrud", call: "createJsonCrud(schema, initial, options?)", sourceKey: "json-crud", symbols: ["createJsonCrud"] },
    ],
  },
  {
    title: "Document",
    apis: [
      { id: "serialize", label: "serialize", call: "serialize(value)", sourceKey: "json-doc", symbols: ["serialize"] },
      { id: "deserialize", label: "deserialize", call: "deserialize(doc, nodeId?)", sourceKey: "json-doc", symbols: ["deserialize"] },
      { id: "getPath", label: "getPath", call: "getPath(doc, nodeId)", sourceKey: "json-doc", symbols: ["getPath"] },
    ],
  },
  {
    title: "Read",
    apis: [
      { id: "snapshot", label: "snapshot", call: "crud.snapshot()", sourceKey: "json-crud", symbols: [] },
      { id: "toJson", label: "toJson", call: "crud.toJson()", sourceKey: "json-crud", symbols: [] },
      { id: "read", label: "read", call: "crud.read(nodeId?)", sourceKey: "json-crud", symbols: [] },
      { id: "pathOf", label: "pathOf", call: "crud.pathOf(nodeId)", sourceKey: "json-crud", symbols: [] },
      { id: "find", label: "find", call: "crud.find(parentId, key)", sourceKey: "json-crud", symbols: [] },
    ],
  },
  {
    title: "Mutation",
    apis: [
      { id: "create", label: "create", call: "crud.create(parentId, key, value?)", sourceKey: "json-crud", symbols: [] },
      { id: "insertAfter", label: "insertAfter", call: "crud.insertAfter(siblingId, value?)", sourceKey: "json-crud", symbols: [] },
      { id: "insertBefore", label: "insertBefore", call: "crud.insertBefore(siblingId, value?)", sourceKey: "json-crud", symbols: [] },
      { id: "appendChild", label: "appendChild", call: "crud.appendChild(parentId, value?)", sourceKey: "json-crud", symbols: [] },
      { id: "update", label: "update", call: "crud.update(nodeId, value)", sourceKey: "json-crud", symbols: [] },
      { id: "rename", label: "rename", call: "crud.rename(nodeId, key)", sourceKey: "json-crud", symbols: [] },
      { id: "delete", label: "delete", call: "crud.delete(nodeId)", sourceKey: "json-crud", symbols: [] },
      { id: "deleteMany", label: "deleteMany", call: "crud.deleteMany(nodeIds)", sourceKey: "json-crud", symbols: [] },
    ],
  },
  {
    title: "Clipboard",
    apis: [
      { id: "copy", label: "copy", call: "crud.copy(nodeId)", sourceKey: "json-crud", symbols: [] },
      { id: "copyMany", label: "copyMany", call: "crud.copyMany(nodeIds)", sourceKey: "json-crud", symbols: [] },
      { id: "cut", label: "cut", call: "crud.cut(nodeId)", sourceKey: "json-crud", symbols: [] },
      { id: "cutMany", label: "cutMany", call: "crud.cutMany(nodeIds)", sourceKey: "json-crud", symbols: [] },
      { id: "paste", label: "paste", call: "crud.paste(targetId, options?)", sourceKey: "json-paste", symbols: [] },
      { id: "canPaste", label: "canPaste", call: "crud.canPaste(targetId, options?)", sourceKey: "json-paste", symbols: [] },
      { id: "canCopyMany", label: "canCopyMany", call: "crud.canCopyMany(nodeIds)", sourceKey: "json-crud", symbols: [] },
      { id: "canCutMany", label: "canCutMany", call: "crud.canCutMany(nodeIds)", sourceKey: "json-crud", symbols: [] },
      { id: "canDeleteMany", label: "canDeleteMany", call: "crud.canDeleteMany(nodeIds)", sourceKey: "json-crud", symbols: [] },
    ],
  },
  {
    title: "History",
    apis: [
      { id: "undo", label: "undo", call: "crud.undo()", sourceKey: "json-crud", symbols: [] },
      { id: "redo", label: "redo", call: "crud.redo()", sourceKey: "json-crud", symbols: [] },
      { id: "canUndo", label: "canUndo", call: "crud.canUndo()", sourceKey: "json-crud", symbols: [] },
      { id: "canRedo", label: "canRedo", call: "crud.canRedo()", sourceKey: "json-crud", symbols: [] },
      { id: "subscribe", label: "subscribe", call: "crud.subscribe(listener)", sourceKey: "json-crud", symbols: [] },
    ],
  },
];
