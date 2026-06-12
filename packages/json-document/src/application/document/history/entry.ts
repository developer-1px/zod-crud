import type { SelectionSnap } from "../../../domain/selection/snap.js";
import type { JSONPatchOperation } from "../../../foundation/patch/contract.js";
import type { HistoryTransactionOptions } from "./metadata.js";

export interface DocumentHistoryEntry {
  forward: JSONPatchOperation[];
  inverse: JSONPatchOperation[];
  selectionBefore: SelectionSnap;
  selectionAfter: SelectionSnap;
  metadata?: HistoryTransactionOptions;
  snapshot?: {
    before: unknown;
    after?: unknown;
  };
}
