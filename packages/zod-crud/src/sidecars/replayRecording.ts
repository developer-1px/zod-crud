import type { JSONPatchOperation } from "../core/patch/index.js";
import type { SelectionSnap } from "../core/selection/index.js";
import { JSONCrudError } from "../JSONCrudError.js";
import type { JSONOps } from "../jsonOps.js";

export interface RecordedStep {
  ops: ReadonlyArray<JSONPatchOperation>;
  at: number;
  label?: string;
  origin?: string;
  mergeKey?: string;
  selectionBefore?: SelectionSnap;
  selectionAfter?: SelectionSnap;
}

export interface Recording<T> {
  startedAt: number;
  initial: T;
  steps: RecordedStep[];
}

export interface ReplaySelectionTarget {
  restore(snapshot: SelectionSnap): void;
}

export interface ReplayDocumentTarget<T> {
  ops: JSONOps<T>;
  selection?: ReplaySelectionTarget | null | undefined;
}

export type ReplayTarget<T> = JSONOps<T> | ReplayDocumentTarget<T>;

export interface ReplayOptions {
  speed?: number;
  signal?: AbortSignal;
  onStep?: (index: number, total: number) => void;
  selection?: ReplaySelectionTarget | null | false;
}

export async function replayRecording<T>(
  recording: Recording<T>,
  target: ReplayTarget<T>,
  options: ReplayOptions = {},
): Promise<void> {
  const speed = options.speed ?? 1;
  const { ops, selection } = resolveReplayTarget(target, options);
  const loadResult = ops.load(recording.initial);
  if (!loadResult.ok) throw new JSONCrudError("load", loadResult);
  if (selection && recording.steps[0]?.selectionBefore) {
    selection.restore(recording.steps[0].selectionBefore);
  }
  let prevAt = 0;
  for (let i = 0; i < recording.steps.length; i++) {
    if (options.signal?.aborted) return;
    const step = recording.steps[i]!;
    const delay = Number.isFinite(speed) ? Math.max(0, (step.at - prevAt) / speed) : 0;
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    if (options.signal?.aborted) return;
    const patchResult = ops.patch(step.ops);
    if (!patchResult.ok) throw new JSONCrudError("patch", patchResult);
    if (selection && step.selectionAfter) selection.restore(step.selectionAfter);
    options.onStep?.(i, recording.steps.length);
    prevAt = step.at;
  }
}

function resolveReplayTarget<T>(
  target: ReplayTarget<T>,
  options: ReplayOptions,
): { ops: JSONOps<T>; selection?: ReplaySelectionTarget } {
  const ops = isReplayDocumentTarget(target) ? target.ops : target;
  if (options.selection === false) return { ops };
  const selection = options.selection ?? (isReplayDocumentTarget(target) ? target.selection ?? undefined : undefined);
  return selection ? { ops, selection } : { ops };
}

function isReplayDocumentTarget<T>(target: ReplayTarget<T>): target is ReplayDocumentTarget<T> {
  return typeof (target as ReplayDocumentTarget<T>).ops?.patch === "function";
}
