import type {
  JsonNode,
  JsonValue,
  NodeId,
  OperationResult,
} from "zod-crud";

import {
  parsePrimitiveDraft,
  type UpdatePreview,
} from "./command-inputs.js";
import {
  entityById,
  makeEditorFromValue,
} from "./entities.js";

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

export function nodeIdAtPath(editor: ReturnType<typeof makeEditorFromValue>, path: Array<string | number>): NodeId {
  let nodeId = editor.snapshot().rootId;

  for (const segment of path) {
    const childId = editor.find(nodeId, segment);

    if (childId === null) {
      throw new Error(`No node found at path segment ${String(segment)}.`);
    }

    nodeId = childId;
  }

  return nodeId;
}

export function valueInput(node: JsonNode | undefined): string {
  if (node === undefined || node.value === undefined) {
    return "";
  }

  return String(node.value);
}

export function isOperationResult(value: unknown): value is OperationResult {
  return typeof value === "object" &&
    value !== null &&
    "ok" in value &&
    typeof (value as { ok: unknown }).ok === "boolean";
}

export function validationMessage(result: OperationResult): string {
  if (result.ok) {
    return "Valid.";
  }

  const issues = result.error?.issues?.map((issue) => `${issue.path.join(".") || "/"}: ${issue.message}`);

  return issues === undefined || issues.length === 0
    ? result.reason
    : `${result.reason} ${issues.join(" ")}`;
}

export function failure(error: unknown): OperationResult {
  return {
    ok: false,
    reason: error instanceof Error ? error.message : String(error),
  };
}

export function isTextEntryTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
}

export function stringify(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (item instanceof Error) {
      return {
        name: item.name,
        message: item.message,
        ...("issues" in item ? { issues: (item as { issues: unknown }).issues } : {}),
      };
    }

    return item;
  }, 2);
}
