import type { JSONPatchOperation } from "../core/patch/index.js";
import type { SelectionSnap } from "../core/selection/index.js";
import { cloneJson } from "../core/json.js";
import { JSONCrudError } from "../JSONCrudError.js";
import type { JSONChangeMetadata, JSONOps } from "../jsonOps.js";

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

export interface RecorderApi<T> {
  readonly isRecording: boolean;
  readonly steps: ReadonlyArray<RecordedStep>;
  start(): void;
  stop(): Recording<T>;
  clear(): void;
}

export interface HeadlessRecorderApi<T> extends RecorderApi<T> {
  dispose(): void;
}

export interface CreateRecorderOptions {
  now?: () => number;
  onChange?: () => void;
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

export function createRecorder<T>(
  ops: JSONOps<T>,
  options: CreateRecorderOptions = {},
): HeadlessRecorderApi<T> {
  const now = options.now ?? Date.now;
  let startedAt: number | null = null;
  let initial: T | null = null;
  let steps: RecordedStep[] = [];
  let unsubscribe: (() => void) | null = null;

  const emit = (): void => {
    options.onChange?.();
  };
  const stopListening = (): void => {
    unsubscribe?.();
    unsubscribe = null;
  };
  const listen = (): void => {
    if (unsubscribe) return;
    unsubscribe = ops.subscribe((applied, metadata) => {
      if (startedAt === null) return;
      steps.push({
        ops: cloneJson([...applied]),
        at: now() - startedAt,
        ...cloneMetadata(metadata),
      });
      emit();
    });
  };

  return {
    get isRecording() { return startedAt !== null; },
    get steps() { return cloneJson(steps); },
    start() {
      if (startedAt !== null) return;
      startedAt = now();
      initial = cloneJson(ops.state);
      steps = [];
      listen();
      emit();
    },
    stop() {
      const at = startedAt ?? now();
      const out: Recording<T> = {
        startedAt: at,
        initial: cloneJson((initial ?? ops.state) as T),
        steps: cloneJson(steps),
      };
      startedAt = null;
      initial = null;
      stopListening();
      emit();
      return out;
    },
    clear() {
      steps = [];
      if (startedAt !== null) {
        startedAt = now();
        initial = cloneJson(ops.state);
      }
      emit();
    },
    dispose() {
      startedAt = null;
      initial = null;
      stopListening();
      emit();
    },
  };
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

function cloneMetadata(metadata: JSONChangeMetadata | undefined): Partial<RecordedStep> {
  if (!metadata) return {};
  const out: Partial<RecordedStep> = {};
  if (metadata.label !== undefined) out.label = metadata.label;
  if (metadata.origin !== undefined) out.origin = metadata.origin;
  if (metadata.mergeKey !== undefined) out.mergeKey = metadata.mergeKey;
  if (metadata.selectionBefore !== undefined) out.selectionBefore = cloneJson(metadata.selectionBefore);
  if (metadata.selectionAfter !== undefined) out.selectionAfter = cloneJson(metadata.selectionAfter);
  return out;
}
