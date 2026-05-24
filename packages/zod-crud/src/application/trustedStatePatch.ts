import type * as z from "zod";

import { applyPatchWithLocalSchemaValidation } from "../domain/schema/localSchemaValidation.js";
import {
  applyPatchToTrustedState as applyPatchToTrustedStateCore,
  type ApplyResult,
  type JSONPatchOperation,
} from "../foundation/json-patch/index.js";

export function applyPatchToTrustedState<S extends z.ZodTypeAny>(
  schema: S,
  state: z.output<S>,
  ops: ReadonlyArray<JSONPatchOperation>,
): ApplyResult<S> {
  return applyPatchWithLocalSchemaValidation(schema, state, ops)
    ?? applyPatchToTrustedStateCore(schema, state, ops);
}
