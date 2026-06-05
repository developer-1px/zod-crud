import type {
  JSONChangeMetadata,
  JSONPatchOperation,
} from "zod-crud";

import type {
  PatchLogEntry,
  PatchLogReplayStep,
} from "./types.js";

export function copyEntry(entry: PatchLogEntry): PatchLogEntry {
  const copied: PatchLogEntry = {
    applied: copyPatch(entry.applied),
  };
  const metadata = copyMetadata(entry.metadata);
  if (metadata !== undefined) return { ...copied, metadata };
  return copied;
}

export function copyPatch(
  operations: ReadonlyArray<JSONPatchOperation>,
): ReadonlyArray<JSONPatchOperation> {
  return operations.map((operation) => copyValue(operation));
}

export function copyMetadata(metadata: JSONChangeMetadata | undefined): JSONChangeMetadata | undefined {
  return metadata === undefined ? undefined : copyValue(metadata);
}

export function copySteps(steps: ReadonlyArray<PatchLogReplayStep>): ReadonlyArray<PatchLogReplayStep> {
  return steps.map((step) => ({
    index: step.index,
    applied: copyPatch(step.applied),
    result: copyValue(step.result),
  }));
}

export function copyValue<T>(value: T): T {
  if (value === null || value === undefined || typeof value !== "object") return value;

  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}
