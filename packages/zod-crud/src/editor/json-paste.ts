import * as z from "zod";

import type {
  JsonDoc,
  JsonValue,
  NodeId,
  PasteOptions,
} from "../types.js";
import { getNode } from "../document/json-doc.js";
import { childPasteCandidates } from "./json-child-paste.js";
import { overwritePasteCandidate } from "./json-overwrite-paste.js";
import type { PasteCandidate } from "./json-paste-candidate.js";
import { childPasteManyCandidates } from "./json-paste-many.js";
import { selfSiblingPasteCandidates } from "./json-self-sibling-paste.js";
import { jsonNodeTypeOf } from "./json-paste-shared.js";

export type { PasteCandidate } from "./json-paste-candidate.js";

export function buildPasteCandidates({
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
}): PasteCandidate[] {
  const target = getNode(doc, targetId);

  if (mode === "overwrite") {
    return [overwritePasteCandidate(doc, targetId, payload, allocateNodeId)];
  }

  if (mode === "child") {
    return childPasteCandidates(doc, schema, targetId, payload, childKeys, index, allocateNodeId);
  }

  const selfSiblingCandidates = selfSiblingPasteCandidates(
    doc,
    clipboardSourceId,
    targetId,
    payload,
    index,
    allocateNodeId,
  );
  const childCandidates = childPasteCandidates(doc, schema, targetId, payload, childKeys, index, allocateNodeId);

  if (selfSiblingCandidates.length > 0) {
    return [...selfSiblingCandidates, ...childCandidates];
  }

  if (target.type === "array") {
    return childCandidates;
  }

  if (target.type === "object") {
    return [overwritePasteCandidate(doc, targetId, payload, allocateNodeId)];
  }

  if (target.type === jsonNodeTypeOf(payload)) {
    return [overwritePasteCandidate(doc, targetId, payload, allocateNodeId)];
  }

  return [];
}

export function buildPasteManyCandidates({
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
}): PasteCandidate[] {
  if (payloads.length === 0 || mode === "overwrite") {
    return [];
  }

  return childPasteManyCandidates(doc, schema, targetId, payloads, childKeys, index, allocateNodeId);
}
