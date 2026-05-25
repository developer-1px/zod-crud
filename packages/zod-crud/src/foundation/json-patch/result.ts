import type * as z from "zod";
import type { Pointer } from "../json-pointer/pointerCore.js";
import type { ErrorCode, JSONResult } from "./types.js";

export const ok: JSONResult = { ok: true };

export function fail(code: ErrorCode, reason?: string, pointer?: Pointer): JSONResult {
  const r: { ok: false; code: ErrorCode; reason?: string; pointer?: Pointer } = { ok: false, code };
  if (reason !== undefined) r.reason = reason;
  if (pointer !== undefined) r.pointer = pointer;
  return r;
}

export const zodIssuesReason = (error: z.ZodError): string => JSON.stringify(error.issues);
