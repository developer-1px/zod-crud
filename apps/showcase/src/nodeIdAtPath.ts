import type { NodeId } from "zod-crud";

import { makeEditorFromValue } from "./entities.js";

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
