import type { JSONPatchOperation } from "../core/patch/index.js";
import type { JSONOps } from "../jsonOps.js";

export interface RecordedStep {
  ops: ReadonlyArray<JSONPatchOperation>;
  at: number;
}

export interface Recording<T> {
  startedAt: number;
  initial: T;
  steps: RecordedStep[];
}

export interface ReplayOptions {
  speed?: number;
  signal?: AbortSignal;
  onStep?: (index: number, total: number) => void;
}

export async function replayRecording<T>(
  recording: Recording<T>,
  ops: JSONOps<T>,
  options: ReplayOptions = {},
): Promise<void> {
  const speed = options.speed ?? 1;
  ops.load(recording.initial);
  let prevAt = 0;
  for (let i = 0; i < recording.steps.length; i++) {
    if (options.signal?.aborted) return;
    const step = recording.steps[i]!;
    const delay = Number.isFinite(speed) ? Math.max(0, (step.at - prevAt) / speed) : 0;
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    if (options.signal?.aborted) return;
    ops.patch(step.ops);
    options.onStep?.(i, recording.steps.length);
    prevAt = step.at;
  }
}
