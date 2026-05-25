import type * as z from "zod";

import { applyPatchWithLocalSchemaValidation } from "../domain/schema/localSchemaValidationCore.js";
import { applyPatchToTrustedState as applyPatchToTrustedStateCore } from "../foundation/json-patch/applyPublic.js";
import {
  type ApplyResult,
  type JSONPatchOperation,
} from "../foundation/json-patch/types.js";

export function applyPatchToTrustedState<S extends z.ZodTypeAny>(
  schema: S,
  state: z.output<S>,
  ops: ReadonlyArray<JSONPatchOperation>,
): ApplyResult<S> {
  return applyPatchWithLocalSchemaValidation(schema, state, ops)
    ?? applyPatchToTrustedStateCore(schema, state, ops);
}
