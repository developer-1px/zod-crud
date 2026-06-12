import type {
  JSONCapabilityResult,
  JSONChangeMetadata,
  JSONPatchInput,
  JSONPatchOperation,
  JSONResult,
  Pointer,
} from "@interactive-os/json-document";

export type ProposedChangeStatus = "open" | "accepted" | "rejected";

export type ProposedChangeErrorCode =
  | "duplicate_id"
  | "empty_patch"
  | "not_found"
  | "not_open"
  | "patch_rejected"
  | "patch_failed"
  | "stale_change";

export interface ProposedChangeGuard {
  path: Pointer;
  value: unknown;
}

export interface ProposedChange {
  id: string;
  status: ProposedChangeStatus;
  operations: ReadonlyArray<JSONPatchOperation>;
  guards: ReadonlyArray<ProposedChangeGuard>;
  label?: string;
  description?: string;
  data?: Readonly<Record<string, unknown>>;
}

export interface ProposedChangeAuditData extends Readonly<Record<string, unknown>> {
  proposedBy?: string;
  source?: string;
  createdAt?: string;
  updatedAt?: string;
  acceptedAt?: string;
  rejectedAt?: string;
  reviewerNote?: string;
}

export interface ProposedChangeInput {
  id?: string;
  operations: JSONPatchInput;
  label?: string;
  description?: string;
  data?: Readonly<Record<string, unknown>>;
}

export interface ProposedChangeFilter {
  status?: ProposedChangeStatus | "all";
}

export interface ProposedChangeSnapshot {
  changes: ReadonlyArray<ProposedChange>;
  open: number;
  accepted: number;
  rejected: number;
}

export interface ProposedChangeError {
  ok: false;
  code: ProposedChangeErrorCode;
  reason: string;
  id?: string;
  pointer?: Pointer;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  result?: Exclude<JSONResult, { ok: true }>;
}

export interface ProposedChangePlan {
  ok: true;
  operations: ReadonlyArray<JSONPatchOperation>;
  guards: ReadonlyArray<ProposedChangeGuard>;
}

export type ProposedChangePlanResult = ProposedChangePlan | ProposedChangeError;

export type ProposedChangeResult =
  | { ok: true; change: ProposedChange }
  | ProposedChangeError;

export type ProposedChangeAcceptResult =
  | { ok: true; change: ProposedChange; result: JSONResult }
  | ProposedChangeError;

export type ProposedChangeListener = (snapshot: ProposedChangeSnapshot) => void;

export interface ProposedChangesOptions {
  initial?: ReadonlyArray<ProposedChange>;
}

export interface ProposedChanges<TDocument> {
  current(filter?: ProposedChangeFilter): ProposedChangeSnapshot;
  byId(id: string): ProposedChange | null;
  canPropose(input: ProposedChangeInput): ProposedChangePlanResult;
  propose(input: ProposedChangeInput): ProposedChangeResult;
  canAccept(id: string): ProposedChangeResult;
  accept(id: string, metadata?: JSONChangeMetadata): ProposedChangeAcceptResult;
  canReject(id: string): ProposedChangeResult;
  reject(id: string): ProposedChangeResult;
  load(changes: ReadonlyArray<ProposedChange>): void;
  remove(id: string): boolean;
  clear(): void;
  subscribe(listener: ProposedChangeListener): () => void;
}

export interface ProposedChangeState {
  nextId: number;
  changes: Map<string, ProposedChange>;
}
