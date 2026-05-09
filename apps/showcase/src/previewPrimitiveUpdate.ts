import type {
  JsonNode,
  JsonValue,
} from "zod-crud";

import {
  parsePrimitiveDraft,
  type UpdatePreview,
} from "./command-inputs.js";
import {
  entityById,
  makeEditorFromValue,
} from "./entities.js";
import { nodeIdAtPath } from "./nodeIdAtPath.js";
import { validationMessage } from "./operation-result-helpers.js";

export function previewPrimitiveUpdate(
  entity: ReturnType<typeof entityById>,
  jsonValue: JsonValue,
  selectedPath: Array<string | number>,
  node: JsonNode | undefined,
  draft: string,
): UpdatePreview {
  if (node === undefined) {
    return { state: "idle", message: "Select a node." };
  }

  if (node.type === "object" || node.type === "array") {
    return { state: "idle", message: "Select a primitive value node." };
  }

  const parsed = parsePrimitiveDraft(node, draft);

  if (!parsed.ok) {
    return { state: "invalid", message: parsed.reason };
  }

  try {
    const previewEditor = makeEditorFromValue(entity, jsonValue);
    const previewId = nodeIdAtPath(previewEditor, selectedPath);
    const result = previewEditor.update(previewId, parsed.value);

    if (!result.ok) {
      return {
        state: "invalid",
        message: validationMessage(result),
        result,
      };
    }

    return {
      state: "valid",
      value: parsed.value,
      result,
    };
  } catch (error) {
    return {
      state: "invalid",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
