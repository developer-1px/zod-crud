import type { SourceKey } from "./source-registry";

export type ApiId =
  | "createJsonCrud" | "serialize" | "deserialize" | "getPath"
  | "snapshot" | "toJson" | "read" | "pathOf" | "find"
  | "create" | "insertAfter" | "insertBefore" | "appendChild"
  | "update" | "rename" | "delete" | "deleteMany"
  | "copy" | "copyMany" | "cut" | "cutMany" | "paste"
  | "canCopyMany" | "canCutMany" | "canDeleteMany" | "canPaste" | "canUndo" | "canRedo"
  | "subscribe" | "undo" | "redo";

export type ApiEntry = {
  id: ApiId;
  call: string;
  sourceKey: SourceKey;
  symbols?: string[];
};

export type ApiGroup = {
  title: string;
  apis: ApiEntry[];
};

export const apiGroups: ApiGroup[] = [
  {
    title: "Factory",
    apis: [
      { id: "createJsonCrud", call: "createJsonCrud(schema, initial, options?)", sourceKey: "json-crud", symbols: ["createJsonCrud"] },
    ],
  },
  {
    title: "Document",
    apis: [
      { id: "serialize", call: "serialize(value)", sourceKey: "json-doc", symbols: ["serialize"] },
      { id: "deserialize", call: "deserialize(doc, nodeId?)", sourceKey: "json-doc", symbols: ["deserialize"] },
      { id: "getPath", call: "getPath(doc, nodeId)", sourceKey: "json-doc", symbols: ["getPath"] },
    ],
  },
  {
    title: "Read",
    apis: [
      { id: "snapshot", call: "crud.snapshot()", sourceKey: "json-crud" },
      { id: "toJson", call: "crud.toJson()", sourceKey: "json-crud" },
      { id: "read", call: "crud.read(nodeId?)", sourceKey: "json-crud" },
      { id: "pathOf", call: "crud.pathOf(nodeId)", sourceKey: "json-crud" },
      { id: "find", call: "crud.find(parentId, key)", sourceKey: "json-crud" },
    ],
  },
  {
    title: "Mutation",
    apis: [
      { id: "create", call: "crud.create(parentId, key, value?)", sourceKey: "json-crud" },
      { id: "insertAfter", call: "crud.insertAfter(siblingId, value?)", sourceKey: "json-crud" },
      { id: "insertBefore", call: "crud.insertBefore(siblingId, value?)", sourceKey: "json-crud" },
      { id: "appendChild", call: "crud.appendChild(parentId, value?)", sourceKey: "json-crud" },
      { id: "update", call: "crud.update(nodeId, value)", sourceKey: "json-crud" },
      { id: "rename", call: "crud.rename(nodeId, key)", sourceKey: "json-crud" },
      { id: "delete", call: "crud.delete(nodeId)", sourceKey: "json-crud" },
      { id: "deleteMany", call: "crud.deleteMany(nodeIds)", sourceKey: "json-crud" },
    ],
  },
  {
    title: "Clipboard",
    apis: [
      { id: "copy", call: "crud.copy(nodeId)", sourceKey: "json-crud" },
      { id: "copyMany", call: "crud.copyMany(nodeIds)", sourceKey: "json-crud" },
      { id: "cut", call: "crud.cut(nodeId)", sourceKey: "json-crud" },
      { id: "cutMany", call: "crud.cutMany(nodeIds)", sourceKey: "json-crud" },
      { id: "paste", call: "crud.paste(targetId, options?)", sourceKey: "json-paste" },
      { id: "canPaste", call: "crud.canPaste(targetId, options?)", sourceKey: "json-paste" },
      { id: "canCopyMany", call: "crud.canCopyMany(nodeIds)", sourceKey: "json-crud" },
      { id: "canCutMany", call: "crud.canCutMany(nodeIds)", sourceKey: "json-crud" },
      { id: "canDeleteMany", call: "crud.canDeleteMany(nodeIds)", sourceKey: "json-crud" },
    ],
  },
  {
    title: "History",
    apis: [
      { id: "undo", call: "crud.undo()", sourceKey: "json-crud" },
      { id: "redo", call: "crud.redo()", sourceKey: "json-crud" },
      { id: "canUndo", call: "crud.canUndo()", sourceKey: "json-crud" },
      { id: "canRedo", call: "crud.canRedo()", sourceKey: "json-crud" },
      { id: "subscribe", call: "crud.subscribe(listener)", sourceKey: "json-crud" },
    ],
  },
];
