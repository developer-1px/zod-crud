export type ApiId =
  | "createJsonCrud"
  | "serialize"
  | "deserialize"
  | "getPath"
  | "snapshot"
  | "toJson"
  | "read"
  | "pathOf"
  | "find"
  | "create"
  | "insertAfter"
  | "insertBefore"
  | "appendChild"
  | "update"
  | "rename"
  | "delete"
  | "deleteMany"
  | "copy"
  | "copyMany"
  | "canCopyMany"
  | "cut"
  | "cutMany"
  | "canCutMany"
  | "paste"
  | "canDeleteMany"
  | "canPaste"
  | "canUndo"
  | "canRedo"
  | "subscribe"
  | "undo"
  | "redo";

export type ApiGroup = {
  title: string;
  apis: Array<{
    id: ApiId;
    label: string;
    call: string;
  }>;
};

export const apiGroups: ApiGroup[] = [
  {
    title: "Factory",
    apis: [
      { id: "createJsonCrud", label: "createJsonCrud", call: "createJsonCrud(schema, initial, options)" },
    ],
  },
  {
    title: "Document",
    apis: [
      { id: "serialize", label: "serialize", call: "serialize(value)" },
      { id: "deserialize", label: "deserialize", call: "deserialize(doc, nodeId?)" },
      { id: "getPath", label: "getPath", call: "getPath(doc, nodeId)" },
    ],
  },
  {
    title: "Read",
    apis: [
      { id: "snapshot", label: "snapshot", call: "crud.snapshot()" },
      { id: "toJson", label: "toJson", call: "crud.toJson()" },
      { id: "read", label: "read", call: "crud.read(nodeId?)" },
      { id: "pathOf", label: "pathOf", call: "crud.pathOf(nodeId)" },
      { id: "find", label: "find", call: "crud.find(parentId, key)" },
    ],
  },
  {
    title: "Mutation",
    apis: [
      { id: "create", label: "create", call: "crud.create(parentId, key, value?)" },
      { id: "insertAfter", label: "insertAfter", call: "crud.insertAfter(siblingId, value?)" },
      { id: "insertBefore", label: "insertBefore", call: "crud.insertBefore(siblingId, value?)" },
      { id: "appendChild", label: "appendChild", call: "crud.appendChild(parentId, value?)" },
      { id: "update", label: "update", call: "crud.update(nodeId, value)" },
      { id: "rename", label: "rename", call: "crud.rename(nodeId, key)" },
      { id: "delete", label: "delete", call: "crud.delete(nodeId)" },
      { id: "deleteMany", label: "deleteMany", call: "crud.deleteMany(nodeIds)" },
    ],
  },
  {
    title: "Clipboard",
    apis: [
      { id: "copy", label: "copy", call: "crud.copy(nodeId)" },
      { id: "copyMany", label: "copyMany", call: "crud.copyMany(nodeIds)" },
      { id: "cut", label: "cut", call: "crud.cut(nodeId)" },
      { id: "cutMany", label: "cutMany", call: "crud.cutMany(nodeIds)" },
      { id: "paste", label: "paste", call: "crud.paste(targetId, options?)" },
    ],
  },
  {
    title: "Capability",
    apis: [
      { id: "canCopyMany", label: "canCopyMany", call: "crud.canCopyMany(nodeIds)" },
      { id: "canCutMany", label: "canCutMany", call: "crud.canCutMany(nodeIds)" },
      { id: "canDeleteMany", label: "canDeleteMany", call: "crud.canDeleteMany(nodeIds)" },
      { id: "canPaste", label: "canPaste", call: "crud.canPaste(targetId, options?)" },
      { id: "canUndo", label: "canUndo", call: "crud.canUndo()" },
      { id: "canRedo", label: "canRedo", call: "crud.canRedo()" },
    ],
  },
  {
    title: "History and subscription",
    apis: [
      { id: "subscribe", label: "subscribe", call: "crud.subscribe(listener)" },
      { id: "undo", label: "undo", call: "crud.undo()" },
      { id: "redo", label: "redo", call: "crud.redo()" },
    ],
  },
];

export function apiCallLabel(apiId: ApiId): string {
  for (const group of apiGroups) {
    const api = group.apis.find((item) => item.id === apiId);

    if (api !== undefined) {
      return api.call;
    }
  }

  return apiId;
}
