import type {
  JSONCapabilityResult,
  JSONChangeMetadata,
  JSONDocument,
  JSONDocumentCommitOptions,
  JSONPatchOperation,
  JSONResult,
} from "zod-crud";

export interface PatchLogEntry {
  readonly applied: ReadonlyArray<JSONPatchOperation>;
  readonly metadata?: JSONChangeMetadata;
}

export type PatchLogReplayMode = "patch" | "commit";

export type PatchLogReplayMetadataOption =
  | "preserve"
  | "omit"
  | JSONChangeMetadata
  | ((entry: PatchLogEntry, index: number) => JSONChangeMetadata | undefined);

export type PatchLogReplayCommitOptions =
  | JSONDocumentCommitOptions
  | ((entry: PatchLogEntry, index: number) => JSONDocumentCommitOptions | undefined);

export interface PatchLogReplayOptions {
  mode?: PatchLogReplayMode;
  metadata?: PatchLogReplayMetadataOption;
  commitOptions?: PatchLogReplayCommitOptions;
}

export interface PatchLogReplayStep {
  readonly index: number;
  readonly applied: ReadonlyArray<JSONPatchOperation>;
  readonly result: JSONResult;
}

export type PatchLogReplayResult =
  | {
      ok: true;
      appliedEntries: number;
      steps: ReadonlyArray<PatchLogReplayStep>;
    }
  | {
      ok: false;
      code: "cannot_patch";
      reason: string;
      index: number;
      appliedEntries: number;
      entry: PatchLogEntry;
      capability: Exclude<JSONCapabilityResult, { ok: true }>;
      steps: ReadonlyArray<PatchLogReplayStep>;
    }
  | {
      ok: false;
      code: "apply_failed";
      reason: string;
      index: number;
      appliedEntries: number;
      entry: PatchLogEntry;
      result: Extract<JSONResult, { ok: false }>;
      steps: ReadonlyArray<PatchLogReplayStep>;
    };

export interface PatchLog<T> {
  entries(): ReadonlyArray<PatchLogEntry>;
  clear(): void;
  pause(): void;
  resume(): void;
  replayInto(targetDoc: JSONDocument<T>, options?: PatchLogReplayOptions): PatchLogReplayResult;
  dispose(): void;
}

export function createPatchLog<T>(doc: JSONDocument<T>): PatchLog<T> {
  const log: PatchLogEntry[] = [];
  let paused = false;
  let disposed = false;

  const unsubscribe = doc.subscribe((applied, metadata) => {
    if (paused || disposed || applied.length === 0) return;
    log.push(copyEntry({ applied, ...(metadata !== undefined ? { metadata } : {}) }));
  });

  return {
    entries: () => log.map(copyEntry),
    clear: () => { log.length = 0; },
    pause: () => { paused = true; },
    resume: () => { if (!disposed) paused = false; },
    replayInto: (targetDoc, options) => replayEntries(targetDoc, log.map(copyEntry), options),
    dispose() {
      if (disposed) return;
      disposed = true;
      paused = true;
      unsubscribe();
    },
  };
}

function replayEntries<T>(
  targetDoc: JSONDocument<T>,
  entries: ReadonlyArray<PatchLogEntry>,
  options: PatchLogReplayOptions = {},
): PatchLogReplayResult {
  const steps: PatchLogReplayStep[] = [];

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (entry === undefined) break;

    const applied = copyPatch(entry.applied);
    const capability = targetDoc.canPatch(applied);
    if (!capability.ok) {
      return {
        ok: false,
        code: "cannot_patch",
        reason: capability.reason ?? "target document rejected recorded patch",
        index,
        appliedEntries: steps.length,
        entry: copyEntry(entry),
        capability: copyValue(capability),
        steps: copySteps(steps),
      };
    }

    const result = applyReplayEntry(targetDoc, entry, applied, index, options);
    if (!result.ok) {
      return {
        ok: false,
        code: "apply_failed",
        reason: result.reason ?? "target document failed to apply recorded patch",
        index,
        appliedEntries: steps.length,
        entry: copyEntry(entry),
        result: copyValue(result),
        steps: copySteps(steps),
      };
    }

    steps.push({
      index,
      applied: copyPatch(applied),
      result: copyValue(result),
    });
  }

  return {
    ok: true,
    appliedEntries: steps.length,
    steps: copySteps(steps),
  };
}

function applyReplayEntry<T>(
  targetDoc: JSONDocument<T>,
  entry: PatchLogEntry,
  applied: ReadonlyArray<JSONPatchOperation>,
  index: number,
  options: PatchLogReplayOptions,
): JSONResult {
  if (options.mode === "commit") {
    if (options.commitOptions !== undefined) {
      const selected = typeof options.commitOptions === "function"
        ? options.commitOptions(copyEntry(entry), index)
        : options.commitOptions;
      return targetDoc.commit(applied, selected === undefined ? undefined : copyValue(selected));
    }

    const metadata = resolvePatchMetadata(entry, index, options.metadata);
    if (metadata === undefined) return targetDoc.commit(applied);

    const commitOptions: JSONDocumentCommitOptions = {};
    if (metadata.label !== undefined) commitOptions.label = metadata.label;
    if (metadata.origin !== undefined) commitOptions.origin = metadata.origin;
    if (metadata.mergeKey !== undefined) commitOptions.mergeKey = metadata.mergeKey;
    return targetDoc.commit(applied, Object.keys(commitOptions).length > 0 ? commitOptions : undefined);
  }

  return targetDoc.patch(applied, resolvePatchMetadata(entry, index, options.metadata));
}

function resolvePatchMetadata(
  entry: PatchLogEntry,
  index: number,
  option: PatchLogReplayMetadataOption | undefined,
): JSONChangeMetadata | undefined {
  const metadataOption = option ?? "preserve";
  if (metadataOption === "omit") return undefined;
  if (metadataOption === "preserve") return copyMetadata(entry.metadata);

  const metadata = typeof metadataOption === "function"
    ? metadataOption(copyEntry(entry), index)
    : metadataOption;
  return copyMetadata(metadata);
}

function copyEntry(entry: PatchLogEntry): PatchLogEntry {
  const copied: PatchLogEntry = {
    applied: copyPatch(entry.applied),
  };
  const metadata = copyMetadata(entry.metadata);
  if (metadata !== undefined) return { ...copied, metadata };
  return copied;
}

function copyPatch(
  operations: ReadonlyArray<JSONPatchOperation>,
): ReadonlyArray<JSONPatchOperation> {
  return operations.map((operation) => copyValue(operation));
}

function copyMetadata(metadata: JSONChangeMetadata | undefined): JSONChangeMetadata | undefined {
  return metadata === undefined ? undefined : copyValue(metadata);
}

function copySteps(steps: ReadonlyArray<PatchLogReplayStep>): ReadonlyArray<PatchLogReplayStep> {
  return steps.map((step) => ({
    index: step.index,
    applied: copyPatch(step.applied),
    result: copyValue(step.result),
  }));
}

function copyValue<T>(value: T): T {
  if (value === null || value === undefined || typeof value !== "object") return value;

  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}
