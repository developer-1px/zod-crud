import type { SourceKey } from "./source-registry";

export type ApiId =
  | "createJsonCrud" | "serialize" | "deserialize" | "getPath"
  | "snapshot" | "toJson" | "read" | "pathOf" | "find"
  | "create" | "insertAfter" | "insertBefore" | "appendChild"
  | "update" | "rename" | "delete" | "deleteMany"
  | "copy" | "copyMany" | "cut" | "cutMany" | "paste"
  | "canCopyMany" | "canCutMany" | "canDeleteMany" | "canPaste" | "canUndo" | "canRedo"
  | "subscribe" | "undo" | "redo";

export type ApiSource = {
  key: SourceKey;
  symbols?: string[];
};

export type ApiEntry = {
  id: ApiId;
  call: string;
  sources: ApiSource[];
};

export type ApiGroup = {
  title: string;
  apis: ApiEntry[];
};

const crudFacade: ApiSource = { key: "json-crud", symbols: ["createJsonCrud"] };
const mutationsFactory: ApiSource = { key: "json-mutations", symbols: ["createMutations"] };
const clipboardFactory: ApiSource = { key: "json-clipboard", symbols: ["createClipboard"] };
const historyFactory: ApiSource = { key: "json-history", symbols: ["createHistory"] };
const deleteManyPlanner: ApiSource = { key: "json-delete-many", symbols: ["planDeleteMany"] };
const pasteCandidates: ApiSource = { key: "json-paste", symbols: ["buildPasteCandidates", "buildPasteManyCandidates"] };

export const apiGroups: ApiGroup[] = [
  {
    title: "Factory",
    apis: [
      { id: "createJsonCrud", call: "createJsonCrud(schema, initial, options?)", sources: [crudFacade] },
    ],
  },
  {
    title: "Document",
    apis: [
      { id: "serialize", call: "serialize(value)", sources: [{ key: "json-doc", symbols: ["serialize"] }] },
      { id: "deserialize", call: "deserialize(doc, nodeId?)", sources: [{ key: "json-doc", symbols: ["deserialize"] }] },
      { id: "getPath", call: "getPath(doc, nodeId)", sources: [{ key: "json-doc", symbols: ["getPath"] }] },
    ],
  },
  {
    title: "Read",
    apis: [
      { id: "snapshot", call: "crud.snapshot()", sources: [crudFacade] },
      { id: "toJson", call: "crud.toJson()", sources: [crudFacade] },
      { id: "read", call: "crud.read(nodeId?)", sources: [crudFacade] },
      { id: "pathOf", call: "crud.pathOf(nodeId)", sources: [crudFacade] },
      { id: "find", call: "crud.find(parentId, key)", sources: [crudFacade] },
    ],
  },
  {
    title: "Mutation",
    apis: [
      { id: "create", call: "crud.create(parentId, key, value?)", sources: [mutationsFactory] },
      { id: "insertAfter", call: "crud.insertAfter(siblingId, value?)", sources: [mutationsFactory] },
      { id: "insertBefore", call: "crud.insertBefore(siblingId, value?)", sources: [mutationsFactory] },
      { id: "appendChild", call: "crud.appendChild(parentId, value?)", sources: [mutationsFactory] },
      { id: "update", call: "crud.update(nodeId, value)", sources: [mutationsFactory] },
      { id: "rename", call: "crud.rename(nodeId, key)", sources: [mutationsFactory] },
      { id: "delete", call: "crud.delete(nodeId)", sources: [mutationsFactory] },
      { id: "deleteMany", call: "crud.deleteMany(nodeIds)", sources: [deleteManyPlanner] },
    ],
  },
  {
    title: "Clipboard",
    apis: [
      { id: "copy", call: "crud.copy(nodeId)", sources: [clipboardFactory] },
      { id: "copyMany", call: "crud.copyMany(nodeIds)", sources: [clipboardFactory] },
      { id: "cut", call: "crud.cut(nodeId)", sources: [clipboardFactory] },
      { id: "cutMany", call: "crud.cutMany(nodeIds)", sources: [clipboardFactory] },
      { id: "paste", call: "crud.paste(targetId, options?)", sources: [clipboardFactory, pasteCandidates] },
      { id: "canPaste", call: "crud.canPaste(targetId, options?)", sources: [clipboardFactory, pasteCandidates] },
      { id: "canCopyMany", call: "crud.canCopyMany(nodeIds)", sources: [clipboardFactory] },
      { id: "canCutMany", call: "crud.canCutMany(nodeIds)", sources: [clipboardFactory] },
      { id: "canDeleteMany", call: "crud.canDeleteMany(nodeIds)", sources: [deleteManyPlanner] },
    ],
  },
  {
    title: "History",
    apis: [
      { id: "undo", call: "crud.undo()", sources: [historyFactory] },
      { id: "redo", call: "crud.redo()", sources: [historyFactory] },
      { id: "canUndo", call: "crud.canUndo()", sources: [historyFactory] },
      { id: "canRedo", call: "crud.canRedo()", sources: [historyFactory] },
      { id: "subscribe", call: "crud.subscribe(listener)", sources: [crudFacade] },
    ],
  },
];
