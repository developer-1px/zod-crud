import {
  deserialize,
  getPath,
  serialize,
} from "zod-crud";

import type { PreparedCommand } from "./command-inputs.js";
import type { PublicCallContext } from "./PublicCallContext.js";

export function executeReadPublicCall(
  command: PreparedCommand,
  context: PublicCallContext,
): { handled: true; output: unknown } | { handled: false } {
  const { editor, targetId } = context;

  if (command.api === "createJsonCrud") {
    return { handled: true, output: { ok: true, ...context.createEditor() } };
  }

  if (command.api === "serialize") {
    return { handled: true, output: serialize(context.jsonValue) };
  }

  if (command.api === "deserialize") {
    return { handled: true, output: deserialize(editor.snapshot(), targetId) };
  }

  if (command.api === "getPath") {
    return { handled: true, output: getPath(editor.snapshot(), targetId) };
  }

  if (command.api === "snapshot") {
    return { handled: true, output: editor.snapshot() };
  }

  if (command.api === "toJson") {
    return { handled: true, output: editor.toJson() };
  }

  if (command.api === "read") {
    return { handled: true, output: editor.read(targetId) };
  }

  if (command.api === "pathOf") {
    return { handled: true, output: editor.pathOf(targetId) };
  }

  if (command.api === "find") {
    return {
      handled: true,
      output: {
        parentId: targetId,
        key: command.findKey,
        nodeId: editor.find(targetId, command.findKey ?? ""),
      },
    };
  }

  return { handled: false };
}
