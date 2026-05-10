import type * as z from "zod";

import type {
  FocusFilter,
  JsonChange,
  JsonDoc,
  JsonPath,
  JsonValue,
  NodeId,
  OperationResult,
} from "../types.js";
import type { Transaction, TransactionResult } from "../json-crud.js";
import { cloneDoc } from "../document/json-doc-clone.js";
import { validateDocument } from "../validation.js";
import { failure } from "../result.js";
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
} from "./mutations.js";
import { planMoveBeside, planMoveInto, type MoveCtx } from "./move.js";
import { planDeleteMany, type DeleteManyPlan } from "./delete-many.js";
import type { LockedRegion } from "../locked-region.js";
import type { MovePlan } from "./move-plan.js";

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
  defaultFor?: (path: JsonPath) => JsonValue;
};

type AnyPlan =
  | MutationPlan
  | DeleteManyPlan
  | (MovePlan | Extract<OperationResult, { ok: false }>);

export function transact<T extends JsonValue, R>(
  deps: TransactionDeps<T>,
  fn: (tx: Transaction) => R,
): TransactionResult<R> {
  const { schema, childKeys, getDoc, getAllocator, setAllocator, commit, lockedRegion, focusFilter, defaultFor } = deps;
  void deps.setDoc;

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

  const mutCtx: MutationsCtx<T> = {
    schema,
    childKeys,
    allocateNodeId: txAllocate,
    ...(defaultFor && { defaultFor }),
  };
  const moveCtx: MoveCtx<T> = {
    schema,
    childKeys,
    allocateNodeId: txAllocate,
    ...(focusFilter && { focusFilter }),
  };

  function applyPlan(plan: AnyPlan): OperationResult {
    if (!plan.ok) return plan;

    for (const change of plan.changes) {
      if (lockedRegion.isLocked(change.nodeId)) {
        return {
          ok: false,
          code: "locked_region",
          reason: `Cannot mutate node ${change.nodeId}: locked region.`,
          nodeId: change.nodeId,
        };
      }
    }

    const validation = validateDocument(schema, plan.next);
    if (!validation.ok) return validation;

    tempDoc = plan.next;
    accumulated.push(...plan.changes);

    const focusNodeId = "focusNodeId" in plan ? plan.focusNodeId : undefined;
    const focusNodeIds = "focusNodeIds" in plan ? plan.focusNodeIds : undefined;

    return {
      ok: true,
      ...(plan.nodeId === undefined ? {} : { nodeId: plan.nodeId }),
      ...(focusNodeId === undefined ? {} : { focusNodeId }),
      ...(focusNodeIds === undefined ? {} : { focusNodeIds }),
      changes: plan.changes,
    };
  }

  function notImpl(name: string): OperationResult {
    return { ok: false, code: "not_implemented", reason: `${name} is not yet implemented in transactions.` };
  }

  const txAbortFailure: { ref: OperationResult | null } = { ref: null };

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
    create: strict((parentId, key, value) => applyPlan(planCreate(tempDoc, mutCtx, parentId, key, value))),
    insertAfter: strict((siblingId, value) => applyPlan(planInsertAfter(tempDoc, mutCtx, siblingId, value))),
    insertBefore: strict((siblingId, value) => applyPlan(planInsertBefore(tempDoc, mutCtx, siblingId, value))),
    appendChild: strict((parentId, value) => applyPlan(planAppendChild(tempDoc, mutCtx, parentId, value))),
    update: strict((nodeId, value) => applyPlan(planUpdate(tempDoc, mutCtx, nodeId, value))),
    rename: strict((nodeId, key) => applyPlan(planRename(tempDoc, mutCtx, nodeId, key))),
    delete: strict((nodeId) => applyPlan(planDelete(tempDoc, mutCtx, nodeId))),
    deleteMany: strict((nodeIds) => {
      try {
        return applyPlan(planDeleteMany({ doc: tempDoc, schema, nodeIds, ...(focusFilter && { focusFilter }) }));
      } catch (error) {
        return failure(error);
      }
    }),
    moveBefore: strict((ids, sib) => applyPlan(planMoveBeside(tempDoc, moveCtx, ids, sib, "before"))),
    moveAfter: strict((ids, sib) => applyPlan(planMoveBeside(tempDoc, moveCtx, ids, sib, "after"))),
    moveInto: strict((ids, parentId, index) => applyPlan(planMoveInto(tempDoc, moveCtx, ids, parentId, index))),
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
}
