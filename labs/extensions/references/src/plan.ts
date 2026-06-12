import { appendSegment, type JSONCapabilityResult, type JSONDocument, type JSONPatchOperation, type JSONResult, type Pointer } from "@interactive-os/json-document";
import type { InvalidReferenceValue, NormalizedReference, ReferenceDiagnostic, ReferenceDiagnosticCode, ReferenceError, ReferenceErrorCode, ReferenceFieldDescriptor, ReferenceIndex, ReferenceLink, ReferencesDescriptor, ReferenceSetInput, ReferenceSetPlanResult, ReferenceSnapshot, ReferenceTarget, ReferenceTargetDescriptor } from "./types.js";

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

export function buildIndex<TDocument>(
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

export function referenceKey(target: string, id: string): string {
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

export function referenceError(
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

export function copyTarget(target: ReferenceTarget): ReferenceTarget {
  const copy: ReferenceTarget = {
    target: target.target,
    id: target.id,
    pointer: target.pointer,
    value: cloneJson(target.value),
  };
  if (target.label !== undefined) copy.label = target.label;
  return copy;
}

export function copyLink(link: ReferenceLink): ReferenceLink {
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

export function cloneJson<T>(value: T): T {
  if (value === undefined) return undefined as T;
  return JSON.parse(JSON.stringify(value)) as T;
}
