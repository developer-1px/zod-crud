import type * as z from "zod";

import { applyPatchWithLocalSchemaValidation } from "../domain/schema/localPatch.js";
import { jsonSerializableError } from "../foundation/json.js";
import {
  applyPatchToTrustedState,
  type ApplyResult,
  type JSONPatchOperation,
} from "../foundation/json-patch/index.js";

export function applyPatch<S extends z.ZodTypeAny>(
  schema: S,
  state: z.output<S>,
  ops: ReadonlyArray<JSONPatchOperation>,
): ApplyResult<S> {
  const stateJsonErr = jsonSerializableError(state);
  if (stateJsonErr) {
    return {
      state,
      result: { ok: false, code: "not_serializable", reason: stateJsonErr },
      applied: [],
    };
  }

  return applyPatchWithLocalSchemaValidation(schema, state, ops)
    ?? applyPatchToTrustedState(schema, state, ops);
}
