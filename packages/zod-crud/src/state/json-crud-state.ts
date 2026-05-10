import type * as z from "zod";

import { maxNodeIndex } from "../document/json-doc-access.js";
import { cloneDoc } from "../document/json-doc-clone.js";
import { serialize } from "../document/json-doc-serialization.js";
import type {
  DefaultValueFactory,
  FocusFilter,
  JsonChange,
  JsonDoc,
  JsonKey,
  JsonPath,
  JsonValue,
  NodeId,
} from "../document/json-doc-types.js";
import type { PasteOptions } from "../clipboard/paste/types.js";
import type { OperationResult } from "../result.js";
import { validateDocument } from "../validation.js";

export type JsonCrudRevision = string | number | null;

export type JsonCrudOptionalValue =
  | { kind: "default" }
  | { kind: "provided"; value: JsonValue };

export type JsonCrudCommand =
  | { type: "create"; parentId: NodeId; key: Exclude<JsonKey, null>; value: JsonCrudOptionalValue }
  | { type: "insertAfter"; siblingId: NodeId; value: JsonCrudOptionalValue }
  | { type: "insertBefore"; siblingId: NodeId; value: JsonCrudOptionalValue }
  | { type: "appendChild"; parentId: NodeId; value: JsonCrudOptionalValue }
  | { type: "update"; nodeId: NodeId; value: JsonValue }
  | { type: "rename"; nodeId: NodeId; key: string }
  | { type: "delete"; nodeId: NodeId }
  | { type: "deleteMany"; nodeIds: NodeId[] }
  | { type: "moveBefore"; nodeIds: NodeId[]; siblingId: NodeId }
  | { type: "moveAfter"; nodeIds: NodeId[]; siblingId: NodeId }
  | { type: "moveInto"; nodeIds: NodeId[]; parentId: NodeId; index: number | null }
  | { type: "wrap"; nodeId: NodeId; key: string }
  | { type: "unwrap"; nodeId: NodeId }
  | { type: "indent"; nodeId: NodeId }
  | { type: "outdent"; nodeId: NodeId }
  | { type: "split"; nodeId: NodeId; at: number }
  | { type: "join"; nodeId: NodeId; withId: NodeId }
  | { type: "copy"; nodeId: NodeId }
  | { type: "copyMany"; nodeIds: NodeId[] }
  | { type: "cut"; nodeId: NodeId }
  | { type: "cutMany"; nodeIds: NodeId[] }
  | { type: "paste"; targetId: NodeId; options: PasteOptions }
  | { type: "undo"; actorId: string | null }
  | { type: "redo"; actorId: string | null }
  | { type: "applyChanges"; changes: JsonChange[] }
  | { type: "markClean" }
  | { type: "lock"; nodeId: NodeId }
  | { type: "unlock"; nodeId: NodeId };

export type JsonCrudEvent = {
  id: string | null;
  actorId: string | null;
  command: JsonCrudCommand;
  changes: JsonChange[];
  inverseChanges: JsonChange[];
  beforeRevision: JsonCrudRevision;
  afterRevision: JsonCrudRevision;
  timestamp: number | null;
};

export type JsonCrudHistoryEntry = {
  eventId: string | null;
  actorId: string | null;
  command: JsonCrudCommand;
  changes: JsonChange[];
  inverseChanges: JsonChange[];
  nodeId: NodeId | null;
  focusNodeId: NodeId | null;
  focusNodeIds: NodeId[];
};

export type JsonCrudHistoryState = {
  localUndo: JsonCrudHistoryEntry[];
  localRedo: JsonCrudHistoryEntry[];
  appliedEvents: JsonCrudEvent[];
};

export type JsonCrudClipboardState = {
  mode: "empty" | "copy" | "cut";
  values: JsonValue[];
  sourceIds: NodeId[] | null;
};

export type JsonCrudState = {
  doc: JsonDoc;
  nextNodeIndex: number;
  revision: JsonCrudRevision;
  history: JsonCrudHistoryState;
  clipboard: JsonCrudClipboardState;
  locks: NodeId[];
  savedDoc: JsonDoc | null;
};

export type JsonCrudContext<T extends JsonValue = JsonValue, I = unknown> = {
  schema: z.ZodType<T, I>;
  childKeys: string[];
  focusFilter?: FocusFilter;
  defaultFor?: DefaultValueFactory;
};

export type JsonCrudSerializableOperationFailure = Omit<Extract<OperationResult, { ok: false }>, "error">;

export type JsonCrudSerializableOperationResult =
  | Extract<OperationResult, { ok: true }>
  | JsonCrudSerializableOperationFailure;

export type JsonCrudDispatchSuccess = {
  ok: true;
  state: JsonCrudState;
  result: Extract<OperationResult, { ok: true }>;
  event: JsonCrudEvent | null;
};

export type JsonCrudDispatchFailure = {
  ok: false;
  state: JsonCrudState;
  result: JsonCrudSerializableOperationFailure;
};

export type JsonCrudDispatchResult = JsonCrudDispatchSuccess | JsonCrudDispatchFailure;

export function createJsonCrudState<T extends JsonValue, I = unknown>(
  schema: z.ZodType<T, I>,
  initialValue: I,
): JsonCrudState {
  const parsed = schema.safeParse(initialValue);

  if (!parsed.success) {
    throw parsed.error;
  }

  const doc = serialize(parsed.data);
  const validation = validateDocument(schema, doc);

  if (!validation.ok) {
    throw new Error(validation.reason, { cause: validation.error });
  }

  return {
    doc,
    nextNodeIndex: maxNodeIndex(doc) + 1,
    revision: null,
    history: {
      localUndo: [],
      localRedo: [],
      appliedEvents: [],
    },
    clipboard: {
      mode: "empty",
      values: [],
      sourceIds: null,
    },
    locks: [],
    savedDoc: cloneDoc(doc),
  };
}
