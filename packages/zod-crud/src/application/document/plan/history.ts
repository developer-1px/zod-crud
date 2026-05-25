import { computeInverses } from "../../../foundation/json-patch/inverse.js";
import type { JSONPatchOperation } from "../../../foundation/json-patch/types.js";
import { readAt, tryParsePointer } from "../../../foundation/json-pointer/pointerCore.js";
import type { HistoryTransactionOptions } from "../runtime/stateOps.js";
import type {
  CompactedRepeatedReplaceBatchHistoryPlan,
  DocumentHistoryAppendPlan,
  DocumentHistoryEntry,
  DocumentHistoryRestoreApplyPlan,
  DocumentHistoryRestoreCompletionPlan,
  DocumentHistoryRestoreFlowPlan,
  DocumentHistoryRestorePlan,
  PlanCompactedRepeatedReplaceBatchHistoryInput,
  PlanDocumentHistoryAppendInput,
  PlanDocumentHistoryEntryInput,
  PlanDocumentHistoryRecordInput,
  PlanDocumentHistoryRestoreApplyInput,
  PlanDocumentHistoryRestoreCompletionInput,
  PlanDocumentHistoryRestoreFlowInput,
  PlanDocumentHistoryRestoreInput,
  PlanRootBulkHistorySnapshotInput,
  RootBulkHistorySnapshotPlan,
} from "./historyTypes.js";
import { compactHistoryMetadata, mergeRepeatedReplaceTransactionMetadata, planCompactedRepeatedReplaceHistory } from "./metadata.js";
import { planDocumentTransactionAppendFastPath } from "./transaction.js";

const ROOT_BULK_HISTORY_SNAPSHOT_THRESHOLD = 512;

export function planDocumentHistoryEntry(
  input: PlanDocumentHistoryEntryInput,
): DocumentHistoryEntry | null {
  const repeatedReplace = planCompactedRepeatedReplaceBatchHistory({
    before: input.before,
    operations: input.operations,
  });
  let forward: JSONPatchOperation[];
  let inverseOps: JSONPatchOperation[];
  if (repeatedReplace !== null) {
    forward = repeatedReplace.forward;
    inverseOps = repeatedReplace.inverse;
  } else {
    const inverse = computeInverses(input.before, input.operations);
    if (!inverse.ok) return null;
    forward = input.operationsOwned ? input.operations as JSONPatchOperation[] : [...input.operations];
    inverseOps = inverse.inverses;
  }

  const entry: DocumentHistoryEntry = {
    forward,
    inverse: inverseOps,
    selectionBefore: input.selectionBefore,
    selectionAfter: input.selectionAfter,
  };
  const snapshot = planRootBulkHistorySnapshot({
    before: input.before,
    after: input.after,
    forward,
  });
  if (snapshot !== null) entry.snapshot = snapshot;
  const historyMetadata = compactHistoryMetadata(input.metadata);
  if (historyMetadata !== undefined) entry.metadata = historyMetadata;
  return entry;
}

export function planDocumentHistoryAppend(
  input: PlanDocumentHistoryAppendInput,
): DocumentHistoryAppendPlan {
  const { entry } = input;
  if (entry === null) return { kind: "skip" };

  if (
    input.previous !== undefined
    && input.activeTransactionStartDepth !== undefined
    && input.currentDepth > input.activeTransactionStartDepth
  ) {
    const compactMetadata = entry.metadata === undefined
      ? input.previous.metadata
      : mergeRepeatedReplaceTransactionMetadata(input.previous.metadata, entry.metadata);
    const compact = planCompactedRepeatedReplaceHistory(input.previous, entry, compactMetadata);
    if (compact !== null) return { kind: "replaceLast", entry: compact };
  }

  return { kind: "commit", entry };
}

export function planDocumentHistoryRecord(
  input: PlanDocumentHistoryRecordInput,
): DocumentHistoryAppendPlan {
  const historyMetadata = compactHistoryMetadata(input.metadata);
  const fastPath = planDocumentTransactionAppendFastPath({
    activeTransactionStartDepth: input.activeTransactionStartDepth,
    currentDepth: input.currentDepth,
    previous: input.previous,
    operations: input.operations,
    selectionAfter: input.selectionAfter,
    metadata: historyMetadata,
  });
  if (fastPath.kind === "replaceLast") return fastPath;

  const entry = planDocumentHistoryEntry({
    before: input.before,
    after: input.after,
    operations: input.operations,
    selectionBefore: input.selectionBefore,
    selectionAfter: input.selectionAfter,
    ...(historyMetadata !== undefined ? { metadata: historyMetadata } : {}),
    ...(input.operationsOwned === true ? { operationsOwned: true } : {}),
  });
  return planDocumentHistoryAppend({
    activeTransactionStartDepth: input.activeTransactionStartDepth,
    currentDepth: input.currentDepth,
    previous: input.previous,
    entry,
  });
}

export function planDocumentHistoryRestore(
  input: PlanDocumentHistoryRestoreInput,
): DocumentHistoryRestorePlan {
  const { direction, entry } = input;
  const snapshot = entry.snapshot;
  const nextEntry: DocumentHistoryEntry = {
    forward: entry.forward,
    inverse: entry.inverse,
    selectionBefore: entry.selectionBefore,
    selectionAfter: direction === "undo" ? input.currentSelection : entry.selectionAfter,
  };
  if (entry.metadata !== undefined) nextEntry.metadata = entry.metadata;

  if (snapshot !== undefined) {
    nextEntry.snapshot = direction === "undo"
      ? { ...snapshot, after: input.currentState }
      : { before: snapshot.before };
  }

  const plan: DocumentHistoryRestorePlan = {
    patch: direction === "undo" ? entry.inverse : entry.forward,
    selectionAfter: direction === "undo" ? entry.selectionBefore : entry.selectionAfter,
    entry: nextEntry,
  };
  const state = direction === "undo" ? snapshot?.before : snapshot?.after;
  if (state !== undefined) plan.state = state;
  return plan;
}

export function planDocumentHistoryRestoreFlow(
  input: PlanDocumentHistoryRestoreFlowInput,
): DocumentHistoryRestoreFlowPlan {
  return input.direction === "undo"
    ? {
        entryStack: "undo",
        writeEntryPhase: "beforeApply",
        move: "back",
      }
    : {
        entryStack: "redo",
        writeEntryPhase: "afterApply",
        move: "forward",
      };
}

export function planDocumentHistoryRestoreApply(
  input: PlanDocumentHistoryRestoreApplyInput,
): DocumentHistoryRestoreApplyPlan {
  if (input.state === undefined) {
    return {
      kind: "patch",
      patch: input.patch,
    };
  }
  return {
    kind: "state",
    state: input.state,
    patch: input.patch,
  };
}

export function planDocumentHistoryRestoreCompletion(
  input: PlanDocumentHistoryRestoreCompletionInput,
): DocumentHistoryRestoreCompletionPlan {
  if (!input.result.ok) return { ok: false };

  return {
    ok: true,
    writeEntryAfterApply: input.flow.writeEntryPhase === "afterApply" ? input.entry : null,
    syncLastPatch: true,
    move: input.flow.move,
    selectionAfter: input.selectionAfter,
  };
}

export function planCompactedRepeatedReplaceBatchHistory(
  input: PlanCompactedRepeatedReplaceBatchHistoryInput,
): CompactedRepeatedReplaceBatchHistoryPlan | null {
  const { before, operations } = input;
  if (!Array.isArray(operations) || operations.length < 2 || !(0 in operations)) return null;

  const first = operations[0]!;
  if (first.op !== "replace" || typeof first.path !== "string") return null;
  const path = first.path;
  let last = first;
  for (let index = 1; index < operations.length; index += 1) {
    if (!(index in operations)) return null;
    const op = operations[index]!;
    if (op.op !== "replace" || op.path !== path) return null;
    last = op;
  }

  const segments = tryParsePointer(path);
  if (segments === null) return null;
  const previous = readAt(before, segments);
  if (!previous.ok) return null;

  return {
    forward: [last],
    inverse: [{ op: "replace", path, value: previous.value }],
  };
}

export function planRootBulkHistorySnapshot(
  input: PlanRootBulkHistorySnapshotInput,
): RootBulkHistorySnapshotPlan | null {
  const { before, after, forward } = input;
  if (
    forward.length < ROOT_BULK_HISTORY_SNAPSHOT_THRESHOLD
    || before === null
    || typeof before !== "object"
    || Array.isArray(before)
    || after === null
    || typeof after !== "object"
    || Array.isArray(after)
  ) {
    return null;
  }
  return isRootObjectMutationBatch(forward) ? { before } : null;
}

function isRootObjectMutationBatch(operations: ReadonlyArray<JSONPatchOperation>): boolean {
  if (operations.length < ROOT_BULK_HISTORY_SNAPSHOT_THRESHOLD) return false;
  for (let index = 0; index < operations.length; index += 1) {
    if (!(index in operations)) return false;
    const op = operations[index]!;
    if (
      (op.op !== "add" && op.op !== "remove" && op.op !== "replace")
      || typeof op.path !== "string"
      || op.path === ""
      || op.path[0] !== "/"
      || op.path.includes("~")
      || op.path.indexOf("/", 1) !== -1
    ) {
      return false;
    }
  }
  return true;
}
