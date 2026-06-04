import type * as z from "zod";
import type { Pointer } from "../pointer/index.js";
import type { ErrorCode, JSONResult } from "./types.js";

export const ok: JSONResult = { ok: true };

export function fail(code: ErrorCode, reason?: string, pointer?: Pointer): JSONResult {
  return { ok: false, code, ...(reason === undefined ? {} : { reason }), ...(pointer === undefined ? {} : { pointer }) };
}

export const zodIssuesReason = (error: z.ZodError): string => JSON.stringify(error.issues);
