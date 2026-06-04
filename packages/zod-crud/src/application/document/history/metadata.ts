import type { SelectionSnap } from "../../../domain/selection/types.js";
import type { HistoryTransactionOptions, JSONChangeMetadata } from "../runtime/types.js";
import type { DocumentHistoryEntry } from "./types.js";

export function buildChangeMetadata(
  active: HistoryTransactionOptions | undefined,
  direct: JSONChangeMetadata | undefined,
  selectionBefore: SelectionSnap,
  includeSelectionBefore: boolean,
): JSONChangeMetadata | undefined {
  const metadata = active === undefined
    ? direct
    : direct === undefined
      ? active
      : { ...active, ...direct };
  if (!includeSelectionBefore && metadata === undefined) return undefined;
  return {
    ...metadata,
    selectionBefore,
  };
}

export function compactHistoryMetadata(
  metadata: HistoryTransactionOptions | undefined,
): HistoryTransactionOptions | undefined {
  if (metadata === undefined) return undefined;
  const { label, origin, mergeKey } = metadata;
  if (label === undefined && origin === undefined && mergeKey === undefined) return undefined;

  return { ...(label === undefined ? {} : { label }), ...(origin === undefined ? {} : { origin }), ...(mergeKey === undefined ? {} : { mergeKey }) };
}

export function mergeRepeatedReplaceTransactionMetadata(
  current: HistoryTransactionOptions | undefined,
  next: HistoryTransactionOptions,
): HistoryTransactionOptions {
  if (
    current === undefined
    || (
      current.label === next.label
      && current.origin === next.origin
      && current.mergeKey === next.mergeKey
    )
  ) {
    return next;
  }
  return { ...current, ...next };
}

export function planMergedDocumentHistoryEntry(
  prev: DocumentHistoryEntry,
  top: DocumentHistoryEntry,
  metadata?: HistoryTransactionOptions,
): DocumentHistoryEntry {
  const compact = planCompactedRepeatedReplaceHistory(prev, top, metadata);
  if (compact !== null) return compact;
  return {
    forward: [...prev.forward, ...top.forward],
    inverse: [...top.inverse, ...prev.inverse],
    selectionBefore: prev.selectionBefore,
    selectionAfter: top.selectionAfter,
    ...(metadata ? { metadata } : {}),
  };
}

export function planCompactedRepeatedReplaceHistory(
  prev: DocumentHistoryEntry,
  top: DocumentHistoryEntry,
  metadata?: HistoryTransactionOptions,
): DocumentHistoryEntry | null {
  if (
    prev.forward.length !== 1
    || prev.inverse.length !== 1
    || top.forward.length !== 1
    || top.inverse.length !== 1
  ) {
    return null;
  }

  const prevForward = prev.forward[0]!;
  const prevInverse = prev.inverse[0]!;
  const topForward = top.forward[0]!;
  const topInverse = top.inverse[0]!;
  if (
    prevForward.op !== "replace"
    || prevInverse.op !== "replace"
    || topForward.op !== "replace"
    || topInverse.op !== "replace"
    || prevForward.path !== prevInverse.path
    || topForward.path !== topInverse.path
    || prevForward.path !== topForward.path
  ) {
    return null;
  }

  const entry: DocumentHistoryEntry = {
    forward: [topForward],
    inverse: [prevInverse],
    selectionBefore: prev.selectionBefore,
    selectionAfter: top.selectionAfter,
  };
  if (prev.snapshot !== undefined) entry.snapshot = prev.snapshot;
  if (metadata !== undefined) entry.metadata = metadata;
  return entry;
}
