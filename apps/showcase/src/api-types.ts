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
