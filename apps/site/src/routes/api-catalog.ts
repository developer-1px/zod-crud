import type { SourceKey } from "./source-registry";

export type ApiId =
  | "createJsonCrud" | "serialize" | "deserialize" | "getPath"
  | "snapshot" | "toJson" | "read" | "pathOf" | "find" | "normalizeSelection"
  | "create" | "insertAfter" | "insertBefore" | "appendChild"
  | "update" | "rename" | "delete" | "deleteMany"
  | "canCreate" | "canInsertAfter" | "canInsertBefore" | "canAppendChild"
  | "canUpdate" | "canRename" | "canDelete"
  | "moveBefore" | "moveAfter" | "moveInto"
  | "canMoveBefore" | "canMoveAfter" | "canMoveInto"
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
const crudInstance: ApiSource = { key: "json-crud-instance", symbols: ["createJsonCrudInstance"] };
const mutationsFactory: ApiSource = { key: "json-mutations", symbols: ["createMutations"] };
const clipboardFactory: ApiSource = { key: "json-clipboard", symbols: ["createClipboard"] };
const historyFactory: ApiSource = { key: "json-history", symbols: ["createHistory"] };
const deleteManyPlanner: ApiSource = { key: "json-delete-many", symbols: ["planDeleteMany"] };
const pastePlans: ApiSource = { key: "json-paste", symbols: ["buildPastePlans", "buildPasteManyPlans"] };
const moveFactory: ApiSource = { key: "json-move", symbols: ["createMove"] };
const selectionNormalizer: ApiSource = { key: "json-selection", symbols: ["normalizeSelection"] };

export const apiGroups: ApiGroup[] = [
  {
    title: "Factory",
    apis: [
      { id: "createJsonCrud", call: "createJsonCrud(schema, initial, options?)", sources: [crudFacade, crudInstance] },
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
      { id: "snapshot", call: "crud.snapshot()", sources: [crudInstance] },
      { id: "toJson", call: "crud.toJson()", sources: [crudInstance] },
      { id: "read", call: "crud.read(nodeId?)", sources: [crudInstance] },
      { id: "pathOf", call: "crud.pathOf(nodeId)", sources: [crudInstance] },
      { id: "find", call: "crud.find(parentId, key)", sources: [crudInstance] },
      { id: "normalizeSelection", call: "crud.normalizeSelection(nodeIds)", sources: [crudInstance, selectionNormalizer] },
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
      { id: "deleteMany", call: "crud.deleteMany(nodeIds)", sources: [crudInstance, deleteManyPlanner] },
      { id: "moveBefore", call: "crud.moveBefore(nodeIds, siblingId)", sources: [moveFactory] },
      { id: "moveAfter", call: "crud.moveAfter(nodeIds, siblingId)", sources: [moveFactory] },
      { id: "moveInto", call: "crud.moveInto(nodeIds, parentId, index?)", sources: [moveFactory] },
    ],
  },
  {
    title: "Preflight",
    apis: [
      { id: "canCreate", call: "crud.canCreate(parentId, key, value?)", sources: [crudInstance, mutationsFactory] },
      { id: "canInsertAfter", call: "crud.canInsertAfter(siblingId, value?)", sources: [crudInstance, mutationsFactory] },
      { id: "canInsertBefore", call: "crud.canInsertBefore(siblingId, value?)", sources: [crudInstance, mutationsFactory] },
      { id: "canAppendChild", call: "crud.canAppendChild(parentId, value?)", sources: [crudInstance, mutationsFactory] },
      { id: "canUpdate", call: "crud.canUpdate(nodeId, value)", sources: [crudInstance, mutationsFactory] },
      { id: "canRename", call: "crud.canRename(nodeId, key)", sources: [crudInstance, mutationsFactory] },
      { id: "canDelete", call: "crud.canDelete(nodeId)", sources: [crudInstance, mutationsFactory] },
      { id: "canDeleteMany", call: "crud.canDeleteMany(nodeIds)", sources: [crudInstance, deleteManyPlanner] },
      { id: "canMoveBefore", call: "crud.canMoveBefore(nodeIds, siblingId)", sources: [crudInstance, moveFactory] },
      { id: "canMoveAfter", call: "crud.canMoveAfter(nodeIds, siblingId)", sources: [crudInstance, moveFactory] },
      { id: "canMoveInto", call: "crud.canMoveInto(nodeIds, parentId, index?)", sources: [crudInstance, moveFactory] },
    ],
  },
  {
    title: "Clipboard",
    apis: [
      { id: "copy", call: "crud.copy(nodeId)", sources: [clipboardFactory] },
      { id: "copyMany", call: "crud.copyMany(nodeIds)", sources: [clipboardFactory] },
      { id: "cut", call: "crud.cut(nodeId)", sources: [clipboardFactory] },
      { id: "cutMany", call: "crud.cutMany(nodeIds)", sources: [clipboardFactory] },
      { id: "paste", call: "crud.paste(targetId, options?)", sources: [clipboardFactory, pastePlans] },
      { id: "canPaste", call: "crud.canPaste(targetId, options?)", sources: [clipboardFactory, pastePlans] },
      { id: "canCopyMany", call: "crud.canCopyMany(nodeIds)", sources: [clipboardFactory] },
      { id: "canCutMany", call: "crud.canCutMany(nodeIds)", sources: [clipboardFactory] },
    ],
  },
  {
    title: "History",
    apis: [
      { id: "undo", call: "crud.undo()", sources: [historyFactory] },
      { id: "redo", call: "crud.redo()", sources: [historyFactory] },
      { id: "canUndo", call: "crud.canUndo()", sources: [historyFactory] },
      { id: "canRedo", call: "crud.canRedo()", sources: [historyFactory] },
      { id: "subscribe", call: "crud.subscribe(listener)", sources: [crudInstance] },
    ],
  },
];
