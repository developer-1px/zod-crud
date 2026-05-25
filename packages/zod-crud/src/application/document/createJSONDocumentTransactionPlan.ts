import type { JSONPatchOperation } from "../../foundation/json-patch/types.js";
import type { Pointer } from "../../foundation/json-pointer/pointerCore.js";
import type { SelectionSnap } from "../../domain/selection/selectionTypes.js";
import type { HistoryTransactionOptions } from "./stateOps.js";
import type { DocumentHistoryEntry } from "./createJSONDocumentHistoryTypes.js";
import {
  mergeGeneralTransactionMetadata,
  mergeRepeatedReplaceTransactionMetadata,
  mergeTransactionMetadataRange,
} from "./createJSONDocumentMetadataPlan.js";

interface PlanDocumentTransactionMergeInput {
  entries: ReadonlyArray<DocumentHistoryEntry>;
  start: number;
  end: number;
}

interface PlanDocumentTransactionMergeRangeInput {
  undoStart: number;
  undoLength: number;
  depthBefore: number;
  currentDepth: number;
}

interface DocumentTransactionMergeRange {
  start: number;
  end: number;
}

interface PlanDocumentTransactionMergeWriteInput {
  range: DocumentTransactionMergeRange | null;
  merged: DocumentHistoryEntry | null;
}

type DocumentTransactionMergeWritePlan =
  | { kind: "skip" }
  | {
      kind: "replaceRange";
      index: number;
      length: number;
      entry: DocumentHistoryEntry;
    };

interface PlanDocumentTransactionAppendCompactInput {
  previous: DocumentHistoryEntry;
  operations: ReadonlyArray<JSONPatchOperation>;
  selectionAfter: SelectionSnap;
  metadata: HistoryTransactionOptions | undefined;
}

interface PlanDocumentTransactionAppendFastPathInput {
  activeTransactionStartDepth: number | undefined;
  currentDepth: number;
  previous: DocumentHistoryEntry | undefined;
  operations: ReadonlyArray<JSONPatchOperation>;
  selectionAfter: SelectionSnap;
  metadata: HistoryTransactionOptions | undefined;
}

type DocumentTransactionAppendFastPathPlan =
  | { kind: "skip" }
  | { kind: "replaceLast"; entry: DocumentHistoryEntry };

export function planDocumentTransactionMerge(
  input: PlanDocumentTransactionMergeInput,
): DocumentHistoryEntry | null {
  const { entries, start, end } = input;
  if (start < 0 || end > entries.length || end - start <= 1) return null;

  const first = entries[start]!;
  const last = entries[end - 1]!;
  let forwardLength = 0;
  let inverseLength = 0;
  let metadata: HistoryTransactionOptions | undefined;
  let repeatedReplacePath: Pointer | false | null = null;
  let repeatedReplaceForward: JSONPatchOperation | undefined;
  let repeatedReplaceInverse: JSONPatchOperation | undefined;

  for (let index = start; index < end; index += 1) {
    const entry = entries[index];
    if (entry === undefined) return null;
    forwardLength += entry.forward.length;
    inverseLength += entry.inverse.length;
    if (entry.metadata !== undefined) {
      metadata = repeatedReplacePath === false
        ? mergeGeneralTransactionMetadata(metadata, entry.metadata)
        : mergeRepeatedReplaceTransactionMetadata(metadata, entry.metadata);
    }

    if (repeatedReplacePath !== false) {
      const forward = entry.forward.length === 1 ? entry.forward[0] : undefined;
      const inverse = entry.inverse.length === 1 ? entry.inverse[0] : undefined;
      if (
        forward?.op === "replace"
        && inverse?.op === "replace"
        && forward.path === inverse.path
        && (repeatedReplacePath === null || repeatedReplacePath === forward.path)
      ) {
        repeatedReplacePath = forward.path;
        repeatedReplaceForward = forward;
        repeatedReplaceInverse ??= inverse;
      } else {
        repeatedReplacePath = false;
        metadata = mergeTransactionMetadataRange(entries, start, index + 1);
      }
    }
  }

  if (
    repeatedReplacePath !== false
    && repeatedReplaceForward !== undefined
    && repeatedReplaceInverse !== undefined
  ) {
    const compact: DocumentHistoryEntry = {
      forward: [repeatedReplaceForward],
      inverse: [repeatedReplaceInverse],
      selectionBefore: first.selectionBefore,
      selectionAfter: last.selectionAfter,
    };
    if (first.snapshot !== undefined) compact.snapshot = first.snapshot;
    if (metadata !== undefined) compact.metadata = metadata;
    return compact;
  }

  const forward = new Array<JSONPatchOperation>(forwardLength);
  let forwardIndex = 0;
  for (let entryIndex = start; entryIndex < end; entryIndex += 1) {
    const entryForward = entries[entryIndex]!.forward;
    for (let index = 0; index < entryForward.length; index += 1) {
      forward[forwardIndex] = entryForward[index]!;
      forwardIndex += 1;
    }
  }

  const inverse = new Array<JSONPatchOperation>(inverseLength);
  let inverseIndex = 0;
  for (let entryIndex = end - 1; entryIndex >= start; entryIndex -= 1) {
    const entryInverse = entries[entryIndex]!.inverse;
    for (let index = 0; index < entryInverse.length; index += 1) {
      inverse[inverseIndex] = entryInverse[index]!;
      inverseIndex += 1;
    }
  }

  const merged: DocumentHistoryEntry = {
    forward,
    inverse,
    selectionBefore: first.selectionBefore,
    selectionAfter: last.selectionAfter,
  };
  if (metadata !== undefined) merged.metadata = metadata;
  return merged;
}

export function planDocumentTransactionMergeRange(
  input: PlanDocumentTransactionMergeRangeInput,
): DocumentTransactionMergeRange | null {
  if (input.currentDepth <= input.depthBefore + 1) return null;

  const start = input.undoStart + input.depthBefore;
  const end = input.undoLength;
  if (start < input.undoStart || end - start <= 1) return null;
  return { start, end };
}

export function planDocumentTransactionMergeWrite(
  input: PlanDocumentTransactionMergeWriteInput,
): DocumentTransactionMergeWritePlan {
  if (input.range === null || input.merged === null) return { kind: "skip" };
  return {
    kind: "replaceRange",
    index: input.range.start,
    length: input.range.start + 1,
    entry: input.merged,
  };
}

export function planDocumentTransactionAppendCompact(
  input: PlanDocumentTransactionAppendCompactInput,
): DocumentHistoryEntry | null {
  const { previous, operations } = input;
  if (operations.length !== 1 || !(0 in operations)) return null;

  const op = operations[0]!;
  if (op.op !== "replace") return null;
  if (previous.forward.length !== 1 || previous.inverse.length !== 1) return null;

  const prevForward = previous.forward[0]!;
  const prevInverse = previous.inverse[0]!;
  if (
    prevForward.op !== "replace"
    || prevInverse.op !== "replace"
    || prevForward.path !== prevInverse.path
    || prevForward.path !== op.path
  ) {
    return null;
  }

  const compact: DocumentHistoryEntry = {
    forward: [op],
    inverse: [prevInverse],
    selectionBefore: previous.selectionBefore,
    selectionAfter: input.selectionAfter,
  };
  if (previous.snapshot !== undefined) compact.snapshot = previous.snapshot;
  const metadata = input.metadata === undefined
    ? previous.metadata
    : mergeRepeatedReplaceTransactionMetadata(previous.metadata, input.metadata);
  if (metadata !== undefined) compact.metadata = metadata;
  return compact;
}

export function planDocumentTransactionAppendFastPath(
  input: PlanDocumentTransactionAppendFastPathInput,
): DocumentTransactionAppendFastPathPlan {
  if (
    input.previous === undefined
    || input.activeTransactionStartDepth === undefined
    || input.currentDepth <= input.activeTransactionStartDepth
  ) {
    return { kind: "skip" };
  }

  const compact = planDocumentTransactionAppendCompact({
    previous: input.previous,
    operations: input.operations,
    selectionAfter: input.selectionAfter,
    metadata: input.metadata,
  });
  return compact === null
    ? { kind: "skip" }
    : { kind: "replaceLast", entry: compact };
}
