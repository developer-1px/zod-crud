import type {
  JSONCapabilityResult,
  JSONChangeMetadata,
  JSONDocument,
  JSONDocumentCommitOptions,
  JSONPatchOperation,
  JSONResult,
} from "@interactive-os/json-document";

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
