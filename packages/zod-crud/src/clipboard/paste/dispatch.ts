import * as z from "zod";

import type {
  JsonDoc,
  JsonValue,
  NodeId,
  PasteOptions,
} from "../../types.js";
import { getNode } from "../../document/json-doc-access.js";
import { childPastePlans } from "./child-paste.js";
import { overwritePastePlan } from "./overwrite-paste.js";
import type { PastePlan } from "./plan.js";
import { childPasteManyPlans } from "./many.js";
import { selfSiblingPastePlans } from "./self-sibling-paste.js";
import { jsonNodeTypeOf } from "../../document/json-doc-values.js";

export type { PastePlan } from "./plan.js";

export function buildPastePlans({
  doc,
  schema,
  targetId,
  payload,
  mode,
  childKeys,
  clipboardSourceId,
  index,
  allocateNodeId,
}: {
  doc: JsonDoc;
  schema: z.ZodType<unknown>;
  targetId: NodeId;
  payload: JsonValue;
  mode: PasteOptions["mode"];
  childKeys: string[];
  clipboardSourceId: NodeId | null;
  index: number | undefined;
  allocateNodeId: () => NodeId;
}): PastePlan[] {
  const target = getNode(doc, targetId);

  if (mode === "overwrite") {
    return [overwritePastePlan(doc, targetId, payload, allocateNodeId)];
  }

  if (mode === "child") {
    return childPastePlans(doc, schema, targetId, payload, childKeys, index, allocateNodeId);
  }

  const selfSiblingPlans = selfSiblingPastePlans(
    doc,
    clipboardSourceId,
    targetId,
    payload,
    index,
    allocateNodeId,
  );
  const childPlans = childPastePlans(doc, schema, targetId, payload, childKeys, index, allocateNodeId);

  if (selfSiblingPlans.length > 0) {
    return [...selfSiblingPlans, ...childPlans];
  }

  if (target.type === "array") {
    return childPlans;
  }

  if (target.type === "object") {
    return [overwritePastePlan(doc, targetId, payload, allocateNodeId)];
  }

  if (target.type === jsonNodeTypeOf(payload)) {
    return [overwritePastePlan(doc, targetId, payload, allocateNodeId)];
  }

  return [];
}

export function buildPasteManyPlans({
  doc,
  schema,
  targetId,
  payloads,
  mode,
  childKeys,
  index,
  allocateNodeId,
}: {
  doc: JsonDoc;
  schema: z.ZodType<unknown>;
  targetId: NodeId;
  payloads: JsonValue[];
  mode: PasteOptions["mode"];
  childKeys: string[];
  index: number | undefined;
  allocateNodeId: () => NodeId;
}): PastePlan[] {
  if (payloads.length === 0 || mode === "overwrite") {
    return [];
  }

  return childPasteManyPlans(doc, schema, targetId, payloads, childKeys, index, allocateNodeId);
}
