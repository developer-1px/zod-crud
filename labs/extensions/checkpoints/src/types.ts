import type { JSONCapabilityResult, JSONResult } from "@interactive-os/json-document";

export type CheckpointErrorCode =
  | "missing_checkpoint"
  | "restore_rejected"
  | "restore_failed";

export interface CheckpointError {
  ok: false;
  code: CheckpointErrorCode;
  reason: string;
  key?: string;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  result?: Extract<JSONResult, { ok: false }>;
}

export interface CheckpointEntry<TValue = unknown> {
  key: string;
  value: TValue;
  savedAt: number;
  label?: string;
}

export interface CheckpointsSnapshot<TValue = unknown> {
  entries: ReadonlyArray<CheckpointEntry<TValue>>;
  count: number;
}

export interface CheckpointSaveOptions {
  label?: string;
}

export interface CheckpointRestoreOptions {
  preserveHistory?: boolean;
}

export type CheckpointSaveResult<TValue = unknown> =
  | { ok: true; checkpoint: CheckpointEntry<TValue> };

export type CheckpointReadResult<TValue = unknown> =
  | { ok: true; checkpoint: CheckpointEntry<TValue> }
  | CheckpointError;

export type CheckpointRestoreResult<TValue = unknown> =
  | { ok: true; checkpoint: CheckpointEntry<TValue>; result: JSONResult }
  | CheckpointError;

export type CheckpointsListener<TValue = unknown> = (snapshot: CheckpointsSnapshot<TValue>) => void;

export interface CreateCheckpointsOptions {
  now?: () => number;
}

export interface Checkpoints<TDocument> {
  current(): CheckpointsSnapshot<TDocument>;
  list(): ReadonlyArray<CheckpointEntry<TDocument>>;
  get(key: string): CheckpointReadResult<TDocument>;
  save(key: string, options?: CheckpointSaveOptions): CheckpointSaveResult<TDocument>;
  canRestore(key: string): JSONCapabilityResult | CheckpointError;
  restore(key: string, options?: CheckpointRestoreOptions): CheckpointRestoreResult<TDocument>;
  remove(key: string): boolean;
  clear(): void;
  subscribe(listener: CheckpointsListener<TDocument>): () => void;
  dispose(): void;
}
