import type { JSONChangeMetadata, JSONPatchOperation } from "zod-crud";

export type MaybePromise<T> = T | Promise<T>;

export type AutoSaveState =
  | "idle"
  | "pending"
  | "saving"
  | "saved"
  | "error"
  | "disposed";

export type AutoSaveReason =
  | "change"
  | "manual"
  | "start";

export interface AutoSaveEvent<TValue> {
  value: TValue;
  reason: AutoSaveReason;
  sequence: number;
  applied?: ReadonlyArray<JSONPatchOperation>;
  metadata?: JSONChangeMetadata;
}

export interface AutoSaveHostResult {
  savedAt?: string;
}

export type AutoSaveHost<TValue> = (
  event: AutoSaveEvent<TValue>,
) => MaybePromise<void | AutoSaveHostResult>;

export interface AutoSaveScheduler {
  schedule(task: () => void): () => void;
}

export interface AutoSaveOptions<TValue> {
  save: AutoSaveHost<TValue>;
  scheduler?: AutoSaveScheduler;
  immediate?: boolean;
}

export interface AutoSaveSnapshot {
  state: AutoSaveState;
  pending: boolean;
  saving: boolean;
  saveCount: number;
  sequence: number;
  lastSavedAt: string | null;
  error: unknown;
}

export type AutoSaveListener = (snapshot: AutoSaveSnapshot) => void;

export type AutoSaveFlushResult =
  | { ok: true; snapshot: AutoSaveSnapshot }
  | { ok: false; snapshot: AutoSaveSnapshot; error: unknown };

export interface AutoSave {
  current(): AutoSaveSnapshot;
  request(reason?: AutoSaveReason): void;
  flush(reason?: AutoSaveReason): Promise<AutoSaveFlushResult>;
  subscribe(listener: AutoSaveListener): () => void;
  dispose(): void;
}

export interface PendingEvent {
  reason: AutoSaveReason;
  sequence: number;
  applied?: ReadonlyArray<JSONPatchOperation>;
  metadata?: JSONChangeMetadata;
}

export interface AutoSaveRuntime {
  state: AutoSaveState;
  pending: boolean;
  saving: boolean;
  saveCount: number;
  sequence: number;
  lastSavedAt: string | null;
  error: unknown;
}
