import type * as z from "zod";

import type {
  FocusFilter,
  JsonChange,
  JsonDoc,
  JsonValue,
  NodeId,
  OperationResult,
} from "../types.js";
import type { Transaction, TransactionResult } from "../json-crud.js";
import { cloneDoc } from "../document/json-doc-clone.js";
import { validateDocument } from "../validation.js";
import { failure } from "../result.js";
import { createMutations } from "./mutations.js";
import { createMove } from "./move.js";
import { planDeleteMany } from "./delete-many.js";
import type { LockedRegion } from "../locked-region.js";

const TX_ABORT = Symbol("zod-crud:tx-abort");

export type TransactionDeps<T extends JsonValue> = {
  schema: z.ZodType<T, any>;
  childKeys: string[];
  getDoc: () => JsonDoc;
  setDoc: (doc: JsonDoc) => void;
  getAllocator: () => number;
  setAllocator: (n: number) => void;
  commit: (
    next: JsonDoc,
    changes: JsonChange[],
    nodeId?: NodeId,
    focusNodeId?: NodeId,
    focusNodeIds?: NodeId[],
  ) => void;
  lockedRegion: LockedRegion;
  focusFilter?: FocusFilter;
  defaultFor?: (path: import("../types.js").JsonPath) => JsonValue;
};

export function transact<T extends JsonValue, R>(
  deps: TransactionDeps<T>,
  fn: (tx: Transaction) => R,
): TransactionResult<R> {
  const { schema, childKeys, getDoc, setDoc, getAllocator, setAllocator, commit, lockedRegion, focusFilter, defaultFor } = deps;

  let tempDoc = cloneDoc(getDoc());
  let tempAllocator = getAllocator();
  const accumulated: JsonChange[] = [];

  function txAllocate(): NodeId {
    let id = `n${tempAllocator}`;
    tempAllocator += 1;
    while (tempDoc.nodes[id] !== undefined) {
      id = `n${tempAllocator}`;
      tempAllocator += 1;
    }
    return id;
  }

  function txCommitIfValid(
    next: JsonDoc,
    changes: JsonChange[],
    nodeId?: NodeId,
    focusNodeId?: NodeId,
    focusNodeIds?: NodeId[],
  ): OperationResult {
    for (const change of changes) {
      if (lockedRegion.isLocked(change.nodeId)) {
        return {
          ok: false,
          code: "locked_region",
          reason: `Cannot mutate node ${change.nodeId}: locked region.`,
          nodeId: change.nodeId,
        };
      }
    }
    const validation = validateDocument(schema, next);
    if (!validation.ok) return validation;

    tempDoc = next;
    accumulated.push(...changes);
    return {
      ok: true,
      ...(nodeId === undefined ? {} : { nodeId }),
      ...(focusNodeId === undefined ? {} : { focusNodeId }),
      ...(focusNodeIds === undefined ? {} : { focusNodeIds }),
      changes,
    };
  }

  const txMutations = createMutations({
    schema,
    childKeys,
    getDoc: () => tempDoc,
    commitIfValid: txCommitIfValid,
    allocateNodeId: txAllocate,
    ...(defaultFor && { defaultFor }),
  });

  const txMove = createMove({
    schema,
    childKeys,
    getDoc: () => tempDoc,
    commitIfValid: txCommitIfValid,
    allocateNodeId: txAllocate,
    ...(focusFilter && { focusFilter }),
  });

  function txDeleteMany(nodeIds: NodeId[]): OperationResult {
    try {
      const plan = planDeleteMany({ doc: tempDoc, schema, nodeIds, ...(focusFilter && { focusFilter }) });
      if (!plan.ok) return plan;
      return txCommitIfValid(plan.next, plan.changes);
    } catch (error) {
      return failure(error);
    }
  }

  function notImpl(name: string): OperationResult {
    return { ok: false, code: "not_implemented", reason: `${name} is not yet implemented in transactions.` };
  }

  // eslint-disable-next-line prefer-const
  let txAbortFailure = { ref: null as OperationResult | null };

  function strict<F extends (...args: never[]) => OperationResult>(fn: F): F {
    return ((...args: Parameters<F>) => {
      const result = fn(...args);
      if (!result.ok) {
        txAbortFailure.ref = result;
        throw TX_ABORT;
      }
      return result;
    }) as F;
  }

  const tx: Transaction = {
    create: strict(txMutations.create),
    insertAfter: strict(txMutations.insertAfter),
    insertBefore: strict(txMutations.insertBefore),
    appendChild: strict(txMutations.appendChild),
    update: strict(txMutations.update),
    rename: strict(txMutations.rename),
    delete: strict(txMutations.delete),
    deleteMany: strict(txDeleteMany),
    moveBefore: strict(txMove.moveBefore),
    moveAfter: strict(txMove.moveAfter),
    moveInto: strict(txMove.moveInto),
    wrap: strict(() => notImpl("wrap")),
    unwrap: strict(() => notImpl("unwrap")),
    indent: strict(() => notImpl("indent")),
    outdent: strict(() => notImpl("outdent")),
    split: strict(() => notImpl("split")),
    join: strict(() => notImpl("join")),
  };

  let value: R;
  try {
    value = fn(tx);
  } catch (error) {
    const captured = txAbortFailure.ref;
    if (error === TX_ABORT && captured !== null && captured.ok === false) {
      return captured as TransactionResult<R>;
    }
    return failure(error) as TransactionResult<R>;
  }

  if (accumulated.length === 0) {
    return { ok: true, value };
  }

  commit(tempDoc, accumulated);
  setAllocator(tempAllocator);
  return { ok: true, value, changes: accumulated };

  void setDoc;
}
