import type { JSONDocument, JSONPatchOperation, Pointer } from "zod-crud";
import type { ToggleValueError, ToggleValueErrorCode, ToggleValueOptions, ToggleValueResult } from "./types.js";

export function canToggleValue<TDocument, TValue = unknown>(
  doc: JSONDocument<TDocument>,
  pointer: Pointer,
  options?: ToggleValueOptions<TValue>,
): ToggleValueResult<TValue> {
  const read = doc.at(pointer);
  if (!read.ok) {
    return error(read.code, read.reason ?? `toggle-value path not found: ${pointer}`, read.pointer);
  }

  const current = read.value as TValue;
  const step = options?.direction === "prev" ? -1 : 1;
  // When the host omits values, derive them from the schema: enum/literal now
  // expose their option set via describe().allowed (zod-crud #130). Booleans
  // still toggle without any value list.
  const values = options?.values ?? enumValuesFromSchema<TValue>(doc, pointer);
  const next = nextValue(current, values, step);
  if (!next.ok) {
    return error("not_toggleable", next.reason, pointer);
  }

  const changed = JSON.stringify(current) !== JSON.stringify(next.value);
  const operations: JSONPatchOperation[] = changed
    ? [{ op: "replace", path: pointer, value: cloneJson(next.value) }]
    : [];

  if (operations.length > 0) {
    const capability = doc.canPatch(operations);
    if (!capability.ok) {
      return {
        ok: false,
        code: "patch_rejected",
        reason: capability.reason ?? `toggle-value patch rejected at ${pointer}`,
        capability,
        ...(capability.pointer === undefined ? {} : { pointer: capability.pointer }),
      };
    }
  }

  return {
    ok: true,
    pointer,
    from: current,
    to: next.value as TValue,
    changed,
    operations,
  };
}

function enumValuesFromSchema<TValue>(
  doc: JSONDocument<unknown>,
  pointer: Pointer,
): ReadonlyArray<TValue> | undefined {
  const described = doc.schema.describe(pointer);
  if (!described.ok) return undefined;
  const allowed = described.description.allowed;
  return allowed && allowed.length > 0 ? (allowed as ReadonlyArray<TValue>) : undefined;
}

function nextValue<TValue>(
  current: TValue,
  values: ReadonlyArray<TValue> | undefined,
  step: number,
): { ok: true; value: TValue } | { ok: false; reason: string } {
  if (values && values.length > 0) {
    const fingerprint = JSON.stringify(current ?? null);
    const at = values.findIndex((value) => JSON.stringify(value ?? null) === fingerprint);
    if (at === -1) {
      // Current value not in the list: jump to the first entry.
      return { ok: true, value: values[0] as TValue };
    }
    const length = values.length;
    const index = (((at + step) % length) + length) % length;
    return { ok: true, value: values[index] as TValue };
  }

  if (typeof current === "boolean") {
    return { ok: true, value: !current as unknown as TValue };
  }

  return {
    ok: false,
    reason: "field is not a boolean; pass options.values to toggle non-boolean fields.",
  };
}

function error(code: ToggleValueErrorCode, reason: string, pointer?: Pointer): ToggleValueError {
  return { ok: false, code, reason, ...(pointer === undefined ? {} : { pointer }) };
}

function cloneJson<TValue>(value: TValue): TValue {
  return JSON.parse(JSON.stringify(value)) as TValue;
}
