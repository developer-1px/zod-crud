import type { z } from "zod";

import type { Pointer } from "../../../foundation/pointer/index.js";
import { appendSegment } from "../../../foundation/pointer/index.js";
import type { CapabilityResult } from "../can/result.js";
import { resolveDocumentSchema } from "./resolve.js";
import type { SchemaPathMode } from "./resolve.js";

export function canDocumentSchemaAccepts<S extends z.ZodType>(
  schema: S,
  path: Pointer,
  value: unknown,
  mode: SchemaPathMode = "value",
): CapabilityResult {
  const resolved = resolveDocumentSchema(schema, path, mode);
  if (!resolved.ok) {
    return {
      ok: false,
      code: resolved.code,
      pointer: resolved.pointer,
      ...(resolved.reason === undefined ? {} : { reason: resolved.reason }),
    };
  }

  const parsed = resolved.schema.safeParse(value);
  if (parsed.success) return { ok: true };
  return {
    ok: false,
    code: "schema_violation",
    reason: JSON.stringify(parsed.error.issues),
    violations: parsed.error.issues.map((issue) => ({
      path: issue.path.reduce<Pointer>((base, segment) => appendSegment(base, String(segment)), path),
      message: issue.message,
    })),
  };
}
