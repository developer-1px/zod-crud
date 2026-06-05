import type {
  JSONPatchOperation,
} from "zod-crud";

import type {
  ProposedChange,
  ProposedChangeGuard,
} from "./types.js";

export function copyChange(change: ProposedChange): ProposedChange {
  const copy: ProposedChange = {
    id: change.id,
    status: change.status,
    operations: copyOperations(change.operations),
    guards: copyGuards(change.guards),
  };
  if (change.label !== undefined) copy.label = change.label;
  if (change.description !== undefined) copy.description = change.description;
  if (change.data !== undefined) copy.data = cloneJson(change.data);
  return copy;
}

export function copyOperations(operations: ReadonlyArray<JSONPatchOperation>): JSONPatchOperation[] {
  return operations.map((operation) => cloneJson(operation) as JSONPatchOperation);
}

export function copyGuards(guards: ReadonlyArray<ProposedChangeGuard>): ProposedChangeGuard[] {
  return guards.map((guard) => ({
    path: guard.path,
    value: cloneJson(guard.value),
  }));
}

export function cloneJson<T>(value: T): T {
  if (value === undefined) return undefined as T;
  return JSON.parse(JSON.stringify(value)) as T;
}
