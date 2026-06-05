import type * as z from "zod";
import type { ApplyResult, JSONPatchOperation, JSONResult } from "../../../foundation/patch/contract.js";
import type { Pointer } from "../../../foundation/pointer/index.js";
import { prefixIssues } from "./schema.js";

export function okLocalSchemaValidation<S extends z.ZodType>(
  state: z.output<S>,
  applied: ReadonlyArray<JSONPatchOperation>,
): ApplyResult<S> {
  return { state, result: { ok: true }, applied };
}

export function failedLocalSchemaValidation<S extends z.ZodType>(
  state: z.output<S>,
  result: Extract<JSONResult, { ok: false }>,
): ApplyResult<S> {
  return { state, result, applied: [] };
}

export function schemaViolation<S extends z.ZodType>(
  state: z.output<S>,
  path: Pointer,
  issues: z.ZodError["issues"],
): ApplyResult<S> {
  return failedLocalSchemaValidation(state, {
    ok: false,
    code: "schema_violation",
    reason: JSON.stringify(prefixIssues(path, issues)),
  });
}

export function operationFailure<S extends z.ZodType>(
  state: z.output<S>,
  code: "not_serializable",
  reason: string,
): ApplyResult<S> {
  return failedLocalSchemaValidation(state, { ok: false, code, reason });
}
