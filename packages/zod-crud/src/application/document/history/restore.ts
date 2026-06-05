import { computeInverses } from "../../../foundation/patch/inverse.js";
import type { JSONPatchOperation } from "../../../foundation/patch/contract.js";
import { readAt, tryParsePointer } from "../../../foundation/pointer/index.js";
import type { HistoryTransactionOptions, JSONChangeMetadata } from "./metadata.js";
import type { SelectionSnap } from "../../../domain/selection/snap.js";
import type { DocumentHistoryEntry } from "./entry.js";
import { compactHistoryMetadata, mergeRepeatedReplaceTransactionMetadata, planCompactedRepeatedReplaceHistory } from "./metadata.js";

const ROOT_BULK_HISTORY_SNAPSHOT_THRESHOLD = 512;

type DocumentHistoryAppendPlan =
  | { kind: "skip" }
  | { kind: "replaceLast"; entry: DocumentHistoryEntry }
  | { kind: "commit"; entry: DocumentHistoryEntry };

interface PlanDocumentHistoryRecordInput {
  activeTransactionStartDepth: number | undefined;
  currentDepth: number;
  previous: DocumentHistoryEntry | undefined;
  before: unknown;
  after: unknown;
  operations: ReadonlyArray<JSONPatchOperation>;
  selectionBefore: SelectionSnap;
  selectionAfter: SelectionSnap;
  metadata: JSONChangeMetadata | undefined;
  operationsOwned: boolean | undefined;
}

interface PlanDocumentHistoryRestoreInput {
  direction: "undo" | "redo";
  entry: DocumentHistoryEntry;
  currentState: unknown;
  currentSelection: SelectionSnap;
}

function planDocumentHistoryEntry(
  input: {
    before: unknown;
    after: unknown;
    operations: ReadonlyArray<JSONPatchOperation>;
    selectionBefore: SelectionSnap;
    selectionAfter: SelectionSnap;
    metadata: HistoryTransactionOptions | undefined;
    operationsOwned: boolean | undefined;
  },
): DocumentHistoryEntry | null {
  const repeatedReplace = planCompactedRepeatedReplaceBatchHistory(input.before, input.operations);
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
  const snapshot = planRootBulkHistorySnapshot(input.before, input.after, forward);
  if (snapshot !== null) entry.snapshot = snapshot;
  if (input.metadata !== undefined) entry.metadata = input.metadata;
  return entry;
}

export function planDocumentHistoryRecord(
  input: PlanDocumentHistoryRecordInput,
): DocumentHistoryAppendPlan {
  const historyMetadata = compactHistoryMetadata(input.metadata);
  const entry = planDocumentHistoryEntry({
    before: input.before,
    after: input.after,
    operations: input.operations,
    selectionBefore: input.selectionBefore,
    selectionAfter: input.selectionAfter,
    metadata: historyMetadata,
    operationsOwned: input.operationsOwned,
  });
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

export function planDocumentHistoryRestore(
  input: PlanDocumentHistoryRestoreInput,
) {
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

  const state = direction === "undo" ? snapshot?.before : snapshot?.after;
  return {
    patch: direction === "undo" ? entry.inverse : entry.forward,
    selectionAfter: direction === "undo" ? entry.selectionBefore : entry.selectionAfter,
    entry: nextEntry,
    ...(state !== undefined ? { state } : {}),
  };
}

function planCompactedRepeatedReplaceBatchHistory(
  before: unknown,
  operations: ReadonlyArray<JSONPatchOperation>,
): { forward: JSONPatchOperation[]; inverse: JSONPatchOperation[] } | null {
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

function planRootBulkHistorySnapshot(
  before: unknown,
  after: unknown,
  forward: ReadonlyArray<JSONPatchOperation>,
): { before: unknown; after?: unknown } | null {
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
