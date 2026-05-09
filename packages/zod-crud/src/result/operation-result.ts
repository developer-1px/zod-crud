import type {
  JsonChange,
  JsonDoc,
  FocusFilter,
  NodeId,
  OperationResult,
} from "../types.js";
import { focusFromMutation } from "../focus/focus-result.js";

export function successResult(
  before: JsonDoc,
  after: JsonDoc,
  changes: JsonChange[],
  nodeId?: NodeId,
  focusNodeId?: NodeId,
  focusNodeIds?: NodeId[],
  focusFilter?: FocusFilter,
): OperationResult {
  return {
    ok: true,
    ...(nodeId === undefined ? {} : { nodeId }),
    focusNodeId: focusNodeId ?? focusFromMutation(before, after, changes, nodeId, focusFilter),
    ...(focusNodeIds === undefined ? {} : { focusNodeIds }),
    changes,
  };
}
