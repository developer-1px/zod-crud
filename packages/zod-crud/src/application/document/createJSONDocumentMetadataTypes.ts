import type { HistoryTransactionOptions } from "./stateOps.js";
import type { DocumentHistoryEntry } from "./createJSONDocumentHistoryTypes.js";

export interface PlanDocumentHistoryMergeMetadataInput {
  previous: HistoryTransactionOptions | undefined;
  next: HistoryTransactionOptions | undefined;
  options?: { mergeKey?: string };
}

export interface PlanDocumentHistoryMergeLastInput {
  isRestoring: boolean;
  historyDepth: number;
  previous: DocumentHistoryEntry | undefined;
  top: DocumentHistoryEntry | undefined;
  options?: { mergeKey?: string };
}

export interface PlanDocumentHistoryMergeLastWriteInput {
  undoLength: number;
  merged: DocumentHistoryEntry | null;
}

export type DocumentHistoryMergeLastWritePlan =
  | { kind: "skip" }
  | {
      kind: "replaceLastPair";
      index: number;
      length: number;
      entry: DocumentHistoryEntry;
    };

export interface PlanDocumentActiveHistoryMetadataInput {
  active: HistoryTransactionOptions | undefined;
  next: HistoryTransactionOptions | undefined;
}

export interface PlanDocumentTransactionScopeInput {
  activeTransactionStartDepth: number | undefined;
  depthBefore: number;
}

export interface DocumentTransactionScopePlan {
  activeTransactionStartDepth: number;
  restoreTransactionStartDepth: number | undefined;
}

export interface PlanDocumentTransactionCallInput {
  optionsOrFn: HistoryTransactionOptions | (() => void);
  maybeFn: (() => void) | undefined;
}

export type DocumentTransactionCallPlan =
  | { kind: "skip" }
  | {
      kind: "run";
      metadata: HistoryTransactionOptions | undefined;
      fn: () => void;
    };
