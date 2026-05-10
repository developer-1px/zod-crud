import {
  getNode,
  maxNodeIndex,
} from "../document/json-doc-access.js";
import { cloneDoc } from "../document/json-doc-clone.js";
import { deserialize } from "../document/json-doc-serialization.js";
import { applyChangesToDoc } from "../history/apply-changes.js";
import { invertChanges } from "../history/change/change-inversion.js";
import {
  planAppendChild,
  planCreate,
  planDelete,
  planInsertAfter,
  planInsertBefore,
  planRename,
  planUpdate,
  type MutationPlan,
  type MutationsCtx,
} from "../mutate/mutations.js";
import { planDeleteMany, type DeleteManyPlan } from "../mutate/delete-many.js";
import { successResult } from "../result.js";
import { validateDocument } from "../validation.js";
import type {
  JsonChange,
  JsonDoc,
  JsonValue,
  NodeId,
  OperationResult,
} from "../types.js";
import type {
  JsonCrudCommand,
  JsonCrudContext,
  JsonCrudDispatchFailure,
  JsonCrudDispatchResult,
  JsonCrudDispatchSuccess,
  JsonCrudEvent,
  JsonCrudHistoryEntry,
  JsonCrudOptionalValue,
  JsonCrudSerializableOperationFailure,
  JsonCrudState,
} from "./json-crud-state.js";

type OperationFailure = Extract<OperationResult, { ok: false }>;
type OperationSuccess = Extract<OperationResult, { ok: true }>;
type SupportedPlan = Exclude<MutationPlan, OperationFailure> | DeleteManyPlan;

export function dispatchJsonCrudCommand<T extends JsonValue, I = unknown>(
  state: JsonCrudState,
  command: JsonCrudCommand,
  context: JsonCrudContext<T, I>,
): JsonCrudDispatchResult {
  switch (command.type) {
    case "create":
    case "insertAfter":
    case "insertBefore":
    case "appendChild":
    case "update":
    case "rename":
    case "delete":
    case "deleteMany":
    case "cut":
    case "cutMany":
      return dispatchPlannedMutation(state, command, context);
    case "copy":
      return dispatchCopy(state, command.nodeId);
    case "copyMany":
      return dispatchCopyMany(state, command.nodeIds);
    case "undo":
      return dispatchUndo(state, command, context);
    case "redo":
      return dispatchRedo(state, command, context);
    case "applyChanges":
      return dispatchApplyChanges(state, command, context);
    case "markClean":
      return success(state, { ok: true, changes: [] }, null, { savedDoc: cloneDoc(state.doc) });
    case "lock":
      return success(state, { ok: true, nodeId: command.nodeId, changes: [] }, null, {
        locks: state.locks.includes(command.nodeId) ? state.locks : [...state.locks, command.nodeId],
      });
    case "unlock":
      return success(state, { ok: true, nodeId: command.nodeId, changes: [] }, null, {
        locks: state.locks.filter((nodeId) => nodeId !== command.nodeId),
      });
    default:
      return failure(state, "not_implemented", `${command.type} is not yet implemented in pure dispatch.`);
  }
}

function dispatchPlannedMutation<T extends JsonValue, I>(
  state: JsonCrudState,
  command: JsonCrudCommand,
  context: JsonCrudContext<T, I>,
): JsonCrudDispatchResult {
  const locked = lockedTargetFailure(state, lockedTargets(command));
  if (locked !== null) return locked;

  const allocator = createAllocator(state);
  const mutationContext: MutationsCtx<T> = {
    schema: context.schema,
    childKeys: context.childKeys,
    allocateNodeId: allocator.allocate,
    ...(context.defaultFor && { defaultFor: context.defaultFor }),
  };
  const plan = planForCommand(state.doc, command, mutationContext, context);

  if (!plan.ok) return failureFromResult(state, plan);

  const lockedChange = lockedChangeFailure(state, plan.changes);
  if (lockedChange !== null) return lockedChange;

  const validation = validateDocument(context.schema, plan.next);
  if (!validation.ok) return failureFromResult(state, validation);

  const clipboard = clipboardForAcceptedMutation(state, command);
  const operationResult = successResult(
    state.doc,
    plan.next,
    plan.changes,
    plan.nodeId,
    "focusNodeId" in plan ? plan.focusNodeId : undefined,
    undefined,
    context.focusFilter,
  ) as OperationSuccess;
  const inverseChanges = invertChanges(plan.changes);
  const event = createEvent(state, command, plan.changes, inverseChanges);
  const historyEntry = createHistoryEntry(event, operationResult);

  return success(state, operationResult, event, {
    doc: plan.next,
    nextNodeIndex: allocator.nextNodeIndex(),
    history: {
      localUndo: [...state.history.localUndo, historyEntry],
      localRedo: [],
      appliedEvents: [...state.history.appliedEvents, event],
    },
    ...(clipboard === null ? {} : { clipboard }),
  });
}

function planForCommand<T extends JsonValue, I>(
  doc: JsonDoc,
  command: JsonCrudCommand,
  mutationContext: MutationsCtx<T>,
  context: JsonCrudContext<T, I>,
): SupportedPlan | OperationFailure {
  switch (command.type) {
    case "create":
      return planCreate(doc, mutationContext, command.parentId, command.key, valueFor(command.value));
    case "insertAfter":
      return planInsertAfter(doc, mutationContext, command.siblingId, valueFor(command.value));
    case "insertBefore":
      return planInsertBefore(doc, mutationContext, command.siblingId, valueFor(command.value));
    case "appendChild":
      return planAppendChild(doc, mutationContext, command.parentId, valueFor(command.value));
    case "update":
      return planUpdate(doc, mutationContext, command.nodeId, command.value);
    case "rename":
      return planRename(doc, mutationContext, command.nodeId, command.key);
    case "delete":
    case "cut":
      return planDelete(doc, mutationContext, command.nodeId);
    case "deleteMany":
    case "cutMany":
      return planDeleteMany({
        doc,
        schema: context.schema,
        nodeIds: command.nodeIds,
        ...(context.focusFilter && { focusFilter: context.focusFilter }),
      });
    default:
      return { ok: false, code: "not_implemented", reason: `${command.type} is not a planned mutation.` };
  }
}

function dispatchCopy(state: JsonCrudState, nodeId: NodeId): JsonCrudDispatchResult {
  try {
    getNode(state.doc, nodeId);
    const value = cloneSerializable(deserialize(state.doc, nodeId)) as JsonValue;
    return success(state, { ok: true, nodeId, changes: [] }, null, {
      clipboard: { mode: "copy", values: [value], sourceIds: [nodeId] },
    });
  } catch (error) {
    return failure(state, "invalid_target", error instanceof Error ? error.message : String(error));
  }
}

function dispatchCopyMany(state: JsonCrudState, nodeIds: NodeId[]): JsonCrudDispatchResult {
  const uniqueNodeIds = uniqueInOrder(nodeIds);

  if (uniqueNodeIds.length === 0) {
    return failure(state, "empty_selection", "No nodes to copy.");
  }

  try {
    const values = uniqueNodeIds.map((nodeId) => {
      getNode(state.doc, nodeId);
      return cloneSerializable(deserialize(state.doc, nodeId)) as JsonValue;
    });
    return success(state, { ok: true, changes: [] }, null, {
      clipboard: { mode: "copy", values, sourceIds: uniqueNodeIds },
    });
  } catch (error) {
    return failure(state, "invalid_target", error instanceof Error ? error.message : String(error));
  }
}

function dispatchApplyChanges(
  state: JsonCrudState,
  command: Extract<JsonCrudCommand, { type: "applyChanges" }>,
  context: JsonCrudContext,
): JsonCrudDispatchResult {
  const locked = lockedChangeFailure(state, command.changes);
  if (locked !== null) return locked;

  const applied = applyChangesToDoc(state.doc, command.changes);
  if (!applied.ok) return failure(state, "change_conflict", applied.reason, applied.conflict);

  const validation = validateDocument(context.schema, applied.next);
  if (!validation.ok) return failureFromResult(state, validation);

  const nextState = {
    ...state,
    doc: applied.next,
    nextNodeIndex: Math.max(state.nextNodeIndex, maxNodeIndex(applied.next) + 1),
  };
  const operationResult = successResult(state.doc, applied.next, command.changes) as OperationSuccess;
  const inverseChanges = invertChanges(command.changes);
  const event = createEvent(state, command, command.changes, inverseChanges);

  return success(state, operationResult, event, {
    ...nextState,
    history: {
      ...nextState.history,
      appliedEvents: [...nextState.history.appliedEvents, event],
    },
  });
}

function dispatchUndo(
  state: JsonCrudState,
  command: Extract<JsonCrudCommand, { type: "undo" }>,
  context: JsonCrudContext,
): JsonCrudDispatchResult {
  const index = historyIndex(state.history.localUndo, command.actorId);
  if (index < 0) return failure(state, "invalid_target", "Undo stack is empty.");

  const entry = state.history.localUndo[index]!;
  return dispatchHistoryChanges(state, command, context, entry, entry.inverseChanges, entry.changes, "undo", index);
}

function dispatchRedo(
  state: JsonCrudState,
  command: Extract<JsonCrudCommand, { type: "redo" }>,
  context: JsonCrudContext,
): JsonCrudDispatchResult {
  const index = historyIndex(state.history.localRedo, command.actorId);
  if (index < 0) return failure(state, "invalid_target", "Redo stack is empty.");

  const entry = state.history.localRedo[index]!;
  return dispatchHistoryChanges(state, command, context, entry, entry.changes, entry.inverseChanges, "redo", index);
}

function dispatchHistoryChanges(
  state: JsonCrudState,
  command: JsonCrudCommand,
  context: JsonCrudContext,
  entry: JsonCrudHistoryEntry,
  changes: JsonChange[],
  inverseChanges: JsonChange[],
  direction: "undo" | "redo",
  index: number,
): JsonCrudDispatchResult {
  const locked = lockedChangeFailure(state, changes);
  if (locked !== null) return locked;

  const applied = applyChangesToDoc(state.doc, changes);
  if (!applied.ok) return failure(state, "change_conflict", applied.reason, applied.conflict);

  const validation = validateDocument(context.schema, applied.next);
  if (!validation.ok) return failureFromResult(state, validation);

  const operationResult = successResult(state.doc, applied.next, changes, entry.nodeId ?? undefined) as OperationSuccess;
  const event = createEvent(state, command, changes, inverseChanges);
  const nextUndo = [...state.history.localUndo];
  const nextRedo = [...state.history.localRedo];

  if (direction === "undo") {
    nextUndo.splice(index, 1);
    nextRedo.push(entry);
  } else {
    nextRedo.splice(index, 1);
    nextUndo.push(entry);
  }

  return success(state, operationResult, event, {
    doc: applied.next,
    history: {
      localUndo: nextUndo,
      localRedo: nextRedo,
      appliedEvents: [...state.history.appliedEvents, event],
    },
  });
}

function clipboardForAcceptedMutation(
  state: JsonCrudState,
  command: JsonCrudCommand,
): JsonCrudState["clipboard"] | null {
  if (command.type === "cut") {
    return {
      mode: "cut",
      values: [cloneSerializable(deserialize(state.doc, command.nodeId)) as JsonValue],
      sourceIds: null,
    };
  }

  if (command.type === "cutMany") {
    const nodeIds = uniqueInOrder(command.nodeIds);
    return {
      mode: "cut",
      values: nodeIds.map((nodeId) => cloneSerializable(deserialize(state.doc, nodeId)) as JsonValue),
      sourceIds: null,
    };
  }

  return null;
}

function lockedTargets(command: JsonCrudCommand): NodeId[] {
  switch (command.type) {
    case "create":
      return [command.parentId];
    case "insertAfter":
    case "insertBefore":
      return [command.siblingId];
    case "appendChild":
      return [command.parentId];
    case "update":
    case "rename":
    case "delete":
    case "cut":
    case "wrap":
    case "unwrap":
    case "indent":
    case "outdent":
    case "split":
      return [command.nodeId];
    case "join":
      return [command.nodeId, command.withId];
    case "deleteMany":
    case "cutMany":
    case "moveBefore":
    case "moveAfter":
    case "moveInto":
    case "copyMany":
      return command.nodeIds;
    case "copy":
      return [command.nodeId];
    case "paste":
      return [command.targetId];
    default:
      return [];
  }
}

function lockedTargetFailure(state: JsonCrudState, nodeIds: NodeId[]): JsonCrudDispatchFailure | null {
  for (const nodeId of nodeIds) {
    if (isLocked(state.doc, state.locks, nodeId)) {
      return failure(state, "locked_region", `Node ${nodeId} is in a locked region.`, nodeId);
    }
  }
  return null;
}

function lockedChangeFailure(state: JsonCrudState, changes: JsonChange[]): JsonCrudDispatchFailure | null {
  for (const change of changes) {
    const nodeId = change.type === "insert" ? change.after.parentId ?? change.nodeId : change.nodeId;
    if (isLocked(state.doc, state.locks, nodeId)) {
      return failure(state, "locked_region", `Cannot mutate node ${change.nodeId}: it is in a locked region.`, change.nodeId);
    }
  }
  return null;
}

function isLocked(doc: JsonDoc, locks: NodeId[], nodeId: NodeId): boolean {
  if (locks.length === 0) return false;
  if (locks.includes(nodeId)) return true;

  let parentId = doc.nodes[nodeId]?.parentId ?? null;
  while (parentId !== null) {
    if (locks.includes(parentId)) return true;
    parentId = doc.nodes[parentId]?.parentId ?? null;
  }
  return false;
}

function valueFor(value: JsonCrudOptionalValue): JsonValue | undefined {
  return value.kind === "provided" ? value.value : undefined;
}

function createAllocator(state: JsonCrudState) {
  let nextNodeIndex = state.nextNodeIndex;

  return {
    allocate(): NodeId {
      let id = `n${nextNodeIndex}`;
      nextNodeIndex += 1;
      while (state.doc.nodes[id] !== undefined) {
        id = `n${nextNodeIndex}`;
        nextNodeIndex += 1;
      }
      return id;
    },
    nextNodeIndex() {
      return nextNodeIndex;
    },
  };
}

function createEvent(
  state: JsonCrudState,
  command: JsonCrudCommand,
  changes: JsonChange[],
  inverseChanges: JsonChange[],
): JsonCrudEvent {
  return {
    id: null,
    actorId: "actorId" in command ? command.actorId : null,
    command: cloneSerializable(command),
    changes: cloneSerializable(changes),
    inverseChanges: cloneSerializable(inverseChanges),
    beforeRevision: state.revision,
    afterRevision: state.revision,
    timestamp: null,
  };
}

function createHistoryEntry(event: JsonCrudEvent, result: OperationSuccess): JsonCrudHistoryEntry {
  return {
    eventId: event.id,
    actorId: event.actorId,
    command: event.command,
    changes: event.changes,
    inverseChanges: event.inverseChanges,
    nodeId: result.nodeId ?? null,
    focusNodeId: result.focusNodeId ?? null,
    focusNodeIds: result.focusNodeIds ?? [],
  };
}

function historyIndex(entries: JsonCrudHistoryEntry[], actorId: string | null): number {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    if (actorId === null || entries[index]?.actorId === actorId) {
      return index;
    }
  }
  return -1;
}

function uniqueInOrder(nodeIds: NodeId[]): NodeId[] {
  return [...new Set(nodeIds)];
}

function success(
  current: JsonCrudState,
  result: OperationSuccess,
  event: JsonCrudEvent | null,
  patch: Partial<JsonCrudState>,
): JsonCrudDispatchSuccess {
  return {
    ok: true,
    state: {
      ...current,
      ...patch,
    },
    result,
    event,
  };
}

function failure(
  state: JsonCrudState,
  code: OperationFailure["code"],
  reason: string,
  nodeId?: NodeId,
): JsonCrudDispatchFailure {
  return {
    ok: false,
    state,
    result: {
      ok: false,
      ...(code === undefined ? {} : { code }),
      reason,
      ...(nodeId === undefined ? {} : { nodeId }),
    },
  };
}

function failureFromResult(state: JsonCrudState, result: OperationFailure): JsonCrudDispatchFailure {
  const serializableResult: JsonCrudSerializableOperationFailure = {
    ok: false,
    ...(result.code === undefined ? {} : { code: result.code }),
    reason: result.reason,
    ...(result.nodeId === undefined ? {} : { nodeId: result.nodeId }),
    ...(result.path === undefined ? {} : { path: result.path }),
  };

  return {
    ok: false,
    state,
    result: serializableResult,
  };
}

function cloneSerializable<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
