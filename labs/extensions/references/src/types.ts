import type { JSONCapabilityResult, JSONChangeMetadata, JSONPatchOperation, JSONResult, Pointer } from "@interactive-os/json-document";

export type ReferenceDiagnosticCode =
  | "ambiguous_target_id"
  | "duplicate_target_id"
  | "invalid_query"
  | "invalid_reference_value"
  | "invalid_target_id"
  | "missing_target";

export type ReferenceErrorCode =
  | "ambiguous_target_id"
  | "descriptor_not_found"
  | "field_not_found"
  | "invalid_reference_value"
  | "patch_failed"
  | "patch_rejected"
  | "target_not_found";

export interface ReferenceTargetDescriptor {
  target: string;
  query: string;
  readId(value: unknown, pointer: Pointer): unknown;
  readLabel?(value: unknown, pointer: Pointer): string | undefined;
}

export interface ReferenceFieldDescriptor {
  field: string;
  target: string;
  query: string;
  readValue?(value: unknown, pointer: Pointer): unknown;
}

export interface ReferencesDescriptor {
  targets: ReadonlyArray<ReferenceTargetDescriptor>;
  fields: ReadonlyArray<ReferenceFieldDescriptor>;
}

export interface ReferenceTarget {
  target: string;
  id: string;
  pointer: Pointer;
  value: unknown;
  label?: string;
}

export interface ReferenceLink {
  field: string;
  target: string;
  id: string;
  source: Pointer;
  valuePointer: Pointer;
  targetPointer: Pointer | null;
}

export interface ReferenceDiagnostic {
  code: ReferenceDiagnosticCode;
  reason: string;
  target?: string;
  field?: string;
  id?: string;
  pointer?: Pointer;
  pointers?: ReadonlyArray<Pointer>;
  value?: unknown;
}

export interface ReferenceSnapshot {
  targets: ReadonlyArray<ReferenceTarget>;
  links: ReadonlyArray<ReferenceLink>;
  diagnostics: ReadonlyArray<ReferenceDiagnostic>;
  targetCount: number;
  linkCount: number;
  missingTargets: number;
  invalidValues: number;
  duplicateTargets: number;
}

export interface ReferenceError {
  ok: false;
  code: ReferenceErrorCode;
  reason: string;
  target?: string;
  field?: string;
  id?: string;
  pointer?: Pointer;
  pointers?: ReadonlyArray<Pointer>;
  value?: unknown;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  result?: Exclude<JSONResult, { ok: true }>;
}

export type ReferenceResolveResult =
  | { ok: true; target: ReferenceTarget }
  | ReferenceError;

export type ReferenceBacklinksResult =
  | { ok: true; links: ReadonlyArray<ReferenceLink> }
  | ReferenceError;

export interface ReferenceSetInput {
  field: string;
  source: Pointer;
  value: unknown;
}

export interface ReferenceSetPlan {
  ok: true;
  operation: JSONPatchOperation;
}

export type ReferenceSetPlanResult = ReferenceSetPlan | ReferenceError;

export type ReferenceSetResult =
  | { ok: true; operation: JSONPatchOperation; result: JSONResult }
  | ReferenceError;

export interface References<TDocument> {
  current(): ReferenceSnapshot;
  targets(target?: string): ReadonlyArray<ReferenceTarget>;
  outgoing(source?: Pointer): ReadonlyArray<ReferenceLink>;
  backlinks(target: string, id: string): ReferenceBacklinksResult;
  resolve(target: string, id: string): ReferenceResolveResult;
  canSet(input: ReferenceSetInput): ReferenceSetPlanResult;
  set(input: ReferenceSetInput, metadata?: JSONChangeMetadata): ReferenceSetResult;
}

export interface ReferenceIndex {
  snapshot: ReferenceSnapshot;
  buckets: Map<string, ReferenceTarget[]>;
}

export interface NormalizedReference {
  id: string;
  valuePointer: Pointer;
}

export interface InvalidReferenceValue {
  pointer: Pointer;
  value: unknown;
  reason: string;
}
