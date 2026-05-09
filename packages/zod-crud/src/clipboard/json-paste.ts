import * as z from "zod";

import type {
  JsonDoc,
  JsonValue,
  NodeId,
  PasteOptions,
} from "../types.js";
import { getNode } from "../document/json-doc.js";
import { childPastePlans } from "./json-child-paste.js";
import { overwritePastePlan } from "./json-overwrite-paste.js";
import type { PastePlan } from "./json-paste-plan.js";
import { childPasteManyPlans } from "./json-paste-many.js";
import { selfSiblingPastePlans } from "./json-self-sibling-paste.js";
import { jsonNodeTypeOf } from "./json-paste-shared.js";

export type { PastePlan } from "./json-paste-plan.js";

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
