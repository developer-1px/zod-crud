import {
  parentPointer,
  type JSONDocument,
  type JSONPatchOperation,
  type Pointer,
} from "zod-crud";

import {
  cloneJson,
  copyGuards,
  copyOperations,
} from "./copy.js";
import {
  capabilityError,
  proposedChangeError,
} from "./errors.js";
import type {
  ProposedChange,
  ProposedChangeGuard,
  ProposedChangeInput,
  ProposedChangePlanResult,
} from "./types.js";

export function canProposeChange<TDocument>(
  doc: JSONDocument<TDocument>,
  changes: ReadonlyMap<string, ProposedChange>,
  input: ProposedChangeInput,
): ProposedChangePlanResult {
  if (input.id !== undefined && changes.has(input.id)) {
    return proposedChangeError("duplicate_id", `proposed change already exists: ${input.id}`, { id: input.id });
  }

  const operations = Array.isArray(input.operations)
    ? input.operations.map((operation) => cloneJson(operation) as JSONPatchOperation)
    : [cloneJson(input.operations) as JSONPatchOperation];
  if (operations.length === 0) {
    return proposedChangeError("empty_patch", "proposed change patch is empty", input.id === undefined ? {} : { id: input.id });
  }

  const capability = doc.canPatch(operations);
  if (!capability.ok) return capabilityError(undefined, capability);

  return {
    ok: true,
    operations: copyOperations(operations),
    guards: copyGuards(guardsFor(doc, operations)),
  };
}

export function createChange(
  id: string,
  input: ProposedChangeInput,
  plan: Exclude<ProposedChangePlanResult, { ok: false }>,
): ProposedChange {
  const change: ProposedChange = {
    id,
    status: "open",
    operations: copyOperations(plan.operations),
    guards: copyGuards(plan.guards),
  };
  if (input.label !== undefined) change.label = input.label;
  if (input.description !== undefined) change.description = input.description;
  if (input.data !== undefined) change.data = cloneJson(input.data);
  return change;
}

function guardsFor<TDocument>(
  doc: JSONDocument<TDocument>,
  operations: ReadonlyArray<JSONPatchOperation>,
): ReadonlyArray<ProposedChangeGuard> {
  const paths = new Set<Pointer>();
  for (const operation of operations) {
    for (const path of guardPaths(operation)) {
      paths.add(path);
    }
  }

  const guards: ProposedChangeGuard[] = [];
  for (const path of paths) {
    const read = doc.at(path);
    if (read.ok) {
      guards.push({ path, value: cloneJson(read.value) });
    }
  }
  return guards;
}

function guardPaths(operation: JSONPatchOperation): Pointer[] {
  if (operation.op === "add") return [guardAddPath(operation.path)];
  if (operation.op === "move") return [operation.from, guardAddPath(operation.path)];
  if (operation.op === "copy") return [operation.from, guardAddPath(operation.path)];
  return [operation.path];
}

function guardAddPath(path: Pointer): Pointer {
  return parentPointer(path) ?? "";
}
