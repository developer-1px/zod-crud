import {
  appendSegment,
  type JSONCapabilityResult,
  type JSONChangeMetadata,
  type JSONDocument,
  type JSONPatchOperation,
  type JSONResult,
  type Pointer,
} from "zod-crud";

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

interface ReferenceIndex {
  snapshot: ReferenceSnapshot;
  buckets: Map<string, ReferenceTarget[]>;
}

interface NormalizedReference {
  id: string;
  valuePointer: Pointer;
}

interface InvalidReferenceValue {
  pointer: Pointer;
  value: unknown;
  reason: string;
}

export function createReferences<TDocument>(
  doc: JSONDocument<TDocument>,
  descriptor: ReferencesDescriptor,
): References<TDocument> {
  return {
    current: () => indexReferences(doc, descriptor),
    targets(target) {
      const targets = indexReferences(doc, descriptor).targets;
      return target === undefined
        ? targets
        : targets.filter((entry) => entry.target === target);
    },
    outgoing(source) {
      const links = indexReferences(doc, descriptor).links;
      return source === undefined
        ? links
        : links.filter((link) => containsPointer(source, link.source));
    },
    backlinks(target, id) {
      const resolved = resolveReference(doc, descriptor, target, id);
      if (!resolved.ok && resolved.code === "target_not_found") return resolved;

      return {
        ok: true,
        links: indexReferences(doc, descriptor).links
          .filter((link) => link.target === target && link.id === id)
          .map(copyLink),
      };
    },
    resolve: (target, id) => resolveReference(doc, descriptor, target, id),
    canSet: (input) => canSetReference(doc, descriptor, input),
    set(input, metadata) {
      const plan = canSetReference(doc, descriptor, input);
      if (!plan.ok) return plan;

      const result = doc.patch(plan.operation, metadata);
      if (!result.ok) return patchError(input, result);
      return { ok: true, operation: copyOperation(plan.operation), result };
    },
  };
}

export function indexReferences<TDocument>(
  doc: JSONDocument<TDocument>,
  descriptor: ReferencesDescriptor,
): ReferenceSnapshot {
  return buildIndex(doc, descriptor).snapshot;
}

export function resolveReference<TDocument>(
  doc: JSONDocument<TDocument>,
  descriptor: ReferencesDescriptor,
  target: string,
  id: string,
): ReferenceResolveResult {
  const bucket = buildIndex(doc, descriptor).buckets.get(referenceKey(target, id)) ?? [];
  if (bucket.length === 0) {
    return referenceError("target_not_found", `reference target not found: ${target}:${id}`, { target, id });
  }
  if (bucket.length > 1) {
    return referenceError("ambiguous_target_id", `reference target is ambiguous: ${target}:${id}`, {
      target,
      id,
      pointers: bucket.map((entry) => entry.pointer),
    });
  }
  return { ok: true, target: copyTarget(bucket[0]!) };
}

export function canSetReference<TDocument>(
  doc: JSONDocument<TDocument>,
  descriptor: ReferencesDescriptor,
  input: ReferenceSetInput,
): ReferenceSetPlanResult {
  const field = descriptor.fields.find((candidate) => candidate.field === input.field);
  if (field === undefined) {
    return referenceError("descriptor_not_found", `reference field descriptor not found: ${input.field}`, {
      field: input.field,
      pointer: input.source,
    });
  }

  const read = doc.at(input.source);
  if (!read.ok) {
    return referenceError("field_not_found", read.reason ?? `reference field not found: ${input.source}`, {
      field: input.field,
      pointer: read.pointer,
    });
  }

  const normalized = normalizeReferenceValues(input.value, input.source);
  if (normalized.invalid.length > 0) {
    const invalid = normalized.invalid[0]!;
    return referenceError("invalid_reference_value", invalid.reason, {
      field: input.field,
      target: field.target,
      pointer: invalid.pointer,
      value: invalid.value,
    });
  }

  const index = buildIndex(doc, descriptor);
  for (const reference of normalized.references) {
    const bucket = index.buckets.get(referenceKey(field.target, reference.id)) ?? [];
    if (bucket.length === 0) {
      return referenceError("target_not_found", `reference target not found: ${field.target}:${reference.id}`, {
        field: input.field,
        target: field.target,
        id: reference.id,
        pointer: reference.valuePointer,
      });
    }
    if (bucket.length > 1) {
      return referenceError("ambiguous_target_id", `reference target is ambiguous: ${field.target}:${reference.id}`, {
        field: input.field,
        target: field.target,
        id: reference.id,
        pointer: reference.valuePointer,
        pointers: bucket.map((entry) => entry.pointer),
      });
    }
  }

  const operation: JSONPatchOperation = {
    op: "replace",
    path: input.source,
    value: cloneJson(input.value),
  };
  const capability = doc.canPatch(operation);
  if (!capability.ok) return capabilityError(input, capability);

  return { ok: true, operation };
}

function buildIndex<TDocument>(
  doc: JSONDocument<TDocument>,
  descriptor: ReferencesDescriptor,
): ReferenceIndex {
  const targets: ReferenceTarget[] = [];
  const links: ReferenceLink[] = [];
  const diagnostics: ReferenceDiagnostic[] = [];
  const buckets = new Map<string, ReferenceTarget[]>();

  for (const targetDescriptor of descriptor.targets) {
    const query = doc.query(targetDescriptor.query);
    if (!query.ok) {
      diagnostics.push(diagnostic("invalid_query", query.reason ?? `invalid target query: ${targetDescriptor.query}`, {
        target: targetDescriptor.target,
      }));
      continue;
    }

    for (const pointer of query.pointers) {
      const read = doc.at(pointer);
      if (!read.ok) continue;

      const idValue = readTargetId(targetDescriptor, read.value, pointer);
      if (!idValue.ok) {
        diagnostics.push(diagnostic("invalid_target_id", idValue.reason, {
          target: targetDescriptor.target,
          pointer,
          value: idValue.value,
        }));
        continue;
      }

      const target = createTarget(targetDescriptor, pointer, idValue.id, read.value);
      targets.push(target);
      const key = referenceKey(target.target, target.id);
      const bucket = buckets.get(key) ?? [];
      bucket.push(target);
      buckets.set(key, bucket);
    }
  }

  for (const bucket of buckets.values()) {
    if (bucket.length <= 1) continue;
    const first = bucket[0]!;
    diagnostics.push(diagnostic("duplicate_target_id", `duplicate reference target id: ${first.target}:${first.id}`, {
      target: first.target,
      id: first.id,
      pointers: bucket.map((entry) => entry.pointer),
    }));
  }

  for (const fieldDescriptor of descriptor.fields) {
    const query = doc.query(fieldDescriptor.query);
    if (!query.ok) {
      diagnostics.push(diagnostic("invalid_query", query.reason ?? `invalid reference field query: ${fieldDescriptor.query}`, {
        field: fieldDescriptor.field,
        target: fieldDescriptor.target,
      }));
      continue;
    }

    for (const pointer of query.pointers) {
      const read = doc.at(pointer);
      if (!read.ok) continue;

      const raw = readFieldValue(fieldDescriptor, read.value, pointer);
      const normalized = normalizeReferenceValues(raw.value, pointer);
      for (const invalid of normalized.invalid) {
        diagnostics.push(diagnostic("invalid_reference_value", invalid.reason, {
          field: fieldDescriptor.field,
          target: fieldDescriptor.target,
          pointer: invalid.pointer,
          value: invalid.value,
        }));
      }

      for (const reference of normalized.references) {
        const bucket = buckets.get(referenceKey(fieldDescriptor.target, reference.id)) ?? [];
        const targetPointer = bucket.length === 1 ? bucket[0]!.pointer : null;
        links.push({
          field: fieldDescriptor.field,
          target: fieldDescriptor.target,
          id: reference.id,
          source: pointer,
          valuePointer: reference.valuePointer,
          targetPointer,
        });

        if (bucket.length === 0) {
          diagnostics.push(diagnostic("missing_target", `reference target not found: ${fieldDescriptor.target}:${reference.id}`, {
            field: fieldDescriptor.field,
            target: fieldDescriptor.target,
            id: reference.id,
            pointer: reference.valuePointer,
          }));
        } else if (bucket.length > 1) {
          diagnostics.push(diagnostic("ambiguous_target_id", `reference target is ambiguous: ${fieldDescriptor.target}:${reference.id}`, {
            field: fieldDescriptor.field,
            target: fieldDescriptor.target,
            id: reference.id,
            pointer: reference.valuePointer,
            pointers: bucket.map((entry) => entry.pointer),
          }));
        }
      }
    }
  }

  const snapshot = createSnapshot(targets, links, diagnostics);
  return { snapshot, buckets };
}

function readTargetId(
  descriptor: ReferenceTargetDescriptor,
  value: unknown,
  pointer: Pointer,
): { ok: true; id: string } | { ok: false; reason: string; value: unknown } {
  let raw: unknown;
  try {
    raw = descriptor.readId(value, pointer);
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "reference target id reader failed",
      value: undefined,
    };
  }

  if (typeof raw === "string" && raw.length > 0) return { ok: true, id: raw };
  return { ok: false, reason: "reference target id must be a non-empty string", value: raw };
}

function readFieldValue(
  descriptor: ReferenceFieldDescriptor,
  value: unknown,
  pointer: Pointer,
): { value: unknown } {
  if (descriptor.readValue === undefined) return { value };

  try {
    return { value: descriptor.readValue(value, pointer) };
  } catch (error) {
    return {
      value: new InvalidReferenceReaderValue(
        error instanceof Error ? error.message : "reference field reader failed",
      ),
    };
  }
}

class InvalidReferenceReaderValue {
  constructor(readonly reason: string) {}
}

function normalizeReferenceValues(value: unknown, source: Pointer): {
  references: NormalizedReference[];
  invalid: InvalidReferenceValue[];
} {
  if (value === null) return { references: [], invalid: [] };
  if (value instanceof InvalidReferenceReaderValue) {
    return {
      references: [],
      invalid: [{ pointer: source, value: undefined, reason: value.reason }],
    };
  }
  if (typeof value === "string") {
    if (value.length === 0) {
      return {
        references: [],
        invalid: [{ pointer: source, value, reason: "reference id must be a non-empty string" }],
      };
    }
    return { references: [{ id: value, valuePointer: source }], invalid: [] };
  }
  if (Array.isArray(value)) {
    const references: NormalizedReference[] = [];
    const invalid: InvalidReferenceValue[] = [];
    value.forEach((item, index) => {
      const pointer = appendSegment(source, String(index));
      if (typeof item === "string" && item.length > 0) {
        references.push({ id: item, valuePointer: pointer });
      } else {
        invalid.push({
          pointer,
          value: item,
          reason: "reference id must be a non-empty string",
        });
      }
    });
    return { references, invalid };
  }
  if (value === undefined) {
    return {
      references: [],
      invalid: [{ pointer: source, value, reason: "reference value must be string, string array, or null" }],
    };
  }
  return {
    references: [],
    invalid: [{ pointer: source, value, reason: "reference value must be string, string array, or null" }],
  };
}

function createTarget(
  descriptor: ReferenceTargetDescriptor,
  pointer: Pointer,
  id: string,
  value: unknown,
): ReferenceTarget {
  const target: ReferenceTarget = {
    target: descriptor.target,
    id,
    pointer,
    value: cloneJson(value),
  };
  const label = descriptor.readLabel?.(value, pointer);
  if (label !== undefined) target.label = label;
  return target;
}

function createSnapshot(
  targets: ReadonlyArray<ReferenceTarget>,
  links: ReadonlyArray<ReferenceLink>,
  diagnostics: ReadonlyArray<ReferenceDiagnostic>,
): ReferenceSnapshot {
  return {
    targets: targets.map(copyTarget),
    links: links.map(copyLink),
    diagnostics: diagnostics.map(copyDiagnostic),
    targetCount: targets.length,
    linkCount: links.length,
    missingTargets: diagnostics.filter((entry) => entry.code === "missing_target").length,
    invalidValues: diagnostics.filter((entry) => (
      entry.code === "invalid_reference_value" || entry.code === "invalid_target_id"
    )).length,
    duplicateTargets: diagnostics.filter((entry) => entry.code === "duplicate_target_id").length,
  };
}

function containsPointer(base: Pointer, path: Pointer): boolean {
  if (base === "") return true;
  return path === base || path.startsWith(`${base}/`);
}

function referenceKey(target: string, id: string): string {
  return `${target}\u0000${id}`;
}

function diagnostic(
  code: ReferenceDiagnosticCode,
  reason: string,
  options: {
    target?: string;
    field?: string;
    id?: string;
    pointer?: Pointer;
    pointers?: ReadonlyArray<Pointer>;
    value?: unknown;
  } = {},
): ReferenceDiagnostic {
  return { code, reason, ...(options.target === undefined ? {} : { target: options.target }), ...(options.field === undefined ? {} : { field: options.field }), ...(options.id === undefined ? {} : { id: options.id }), ...(options.pointer === undefined ? {} : { pointer: options.pointer }), ...(options.pointers === undefined ? {} : { pointers: [...options.pointers] }), ...(options.value === undefined ? {} : { value: cloneJson(options.value) }) };
}

function referenceError(
  code: ReferenceErrorCode,
  reason: string,
  options: {
    target?: string;
    field?: string;
    id?: string;
    pointer?: Pointer;
    pointers?: ReadonlyArray<Pointer>;
    value?: unknown;
    capability?: Exclude<JSONCapabilityResult, { ok: true }>;
    result?: Exclude<JSONResult, { ok: true }>;
  } = {},
): ReferenceError {
  return { ok: false, code, reason, ...(options.target === undefined ? {} : { target: options.target }), ...(options.field === undefined ? {} : { field: options.field }), ...(options.id === undefined ? {} : { id: options.id }), ...(options.pointer === undefined ? {} : { pointer: options.pointer }), ...(options.pointers === undefined ? {} : { pointers: [...options.pointers] }), ...(options.value === undefined ? {} : { value: cloneJson(options.value) }), ...(options.capability === undefined ? {} : { capability: options.capability }), ...(options.result === undefined ? {} : { result: options.result }) };
}

function capabilityError(
  input: ReferenceSetInput,
  capability: Exclude<JSONCapabilityResult, { ok: true }>,
): ReferenceError {
  return referenceError("patch_rejected", capability.reason ?? "reference patch rejected", {
    field: input.field,
    pointer: capability.pointer ?? input.source,
    capability: cloneJson(capability) as Exclude<JSONCapabilityResult, { ok: true }>,
  });
}

function patchError(
  input: ReferenceSetInput,
  result: Exclude<JSONResult, { ok: true }>,
): ReferenceError {
  return referenceError("patch_failed", result.reason ?? "reference patch failed", {
    field: input.field,
    pointer: result.pointer ?? input.source,
    result: cloneJson(result) as Exclude<JSONResult, { ok: true }>,
  });
}

function copyTarget(target: ReferenceTarget): ReferenceTarget {
  const copy: ReferenceTarget = {
    target: target.target,
    id: target.id,
    pointer: target.pointer,
    value: cloneJson(target.value),
  };
  if (target.label !== undefined) copy.label = target.label;
  return copy;
}

function copyLink(link: ReferenceLink): ReferenceLink {
  return {
    field: link.field,
    target: link.target,
    id: link.id,
    source: link.source,
    valuePointer: link.valuePointer,
    targetPointer: link.targetPointer,
  };
}

function copyDiagnostic(entry: ReferenceDiagnostic): ReferenceDiagnostic {
  return diagnostic(entry.code, entry.reason, {
    ...(entry.target === undefined ? {} : { target: entry.target }),
    ...(entry.field === undefined ? {} : { field: entry.field }),
    ...(entry.id === undefined ? {} : { id: entry.id }),
    ...(entry.pointer === undefined ? {} : { pointer: entry.pointer }),
    ...(entry.pointers === undefined ? {} : { pointers: entry.pointers }),
    ...(entry.value === undefined ? {} : { value: entry.value }),
  });
}

function copyOperation(operation: JSONPatchOperation): JSONPatchOperation {
  return cloneJson(operation) as JSONPatchOperation;
}

function cloneJson<T>(value: T): T {
  if (value === undefined) return undefined as T;
  return JSON.parse(JSON.stringify(value)) as T;
}
