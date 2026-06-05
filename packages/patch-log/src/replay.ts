import type {
  JSONChangeMetadata,
  JSONDocument,
  JSONDocumentCommitOptions,
  JSONPatchOperation,
  JSONResult,
} from "zod-crud";

import {
  copyEntry,
  copyMetadata,
  copyPatch,
  copySteps,
  copyValue,
} from "./copy.js";
import type {
  PatchLogEntry,
  PatchLogReplayMetadataOption,
  PatchLogReplayOptions,
  PatchLogReplayResult,
  PatchLogReplayStep,
} from "./types.js";

export function replayEntries<T>(
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
    return targetDoc.commit(applied, resolveCommitOptions(entry, index, options));
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

function resolveCommitOptions(
  entry: PatchLogEntry,
  index: number,
  options: PatchLogReplayOptions,
): JSONDocumentCommitOptions | undefined {
  if (options.commitOptions !== undefined) {
    const selected = typeof options.commitOptions === "function"
      ? options.commitOptions(copyEntry(entry), index)
      : options.commitOptions;
    return selected === undefined ? undefined : copyValue(selected);
  }

  return commitOptionsFromMetadata(resolvePatchMetadata(entry, index, options.metadata));
}

function commitOptionsFromMetadata(
  metadata: JSONChangeMetadata | undefined,
): JSONDocumentCommitOptions | undefined {
  if (metadata === undefined) return undefined;

  const options: JSONDocumentCommitOptions = {};
  if (metadata.label !== undefined) options.label = metadata.label;
  if (metadata.origin !== undefined) options.origin = metadata.origin;
  if (metadata.mergeKey !== undefined) options.mergeKey = metadata.mergeKey;
  return Object.keys(options).length > 0 ? options : undefined;
}
