import type { PreparedCommand } from "./command-inputs.js";
import type { PublicCallContext } from "./PublicCallContext.js";
import { executeReadPublicCall } from "./public-read-calls.js";

export type { PublicCallContext } from "./PublicCallContext.js";

export function executePublicCall(command: PreparedCommand, context: PublicCallContext): unknown {
  const { editor, targetId, targetIds } = context;
  const readCall = executeReadPublicCall(command, context);

  if (readCall.handled) {
    return readCall.output;
  }

  if (command.api === "create") {
    return command.jsonValue?.omitted
      ? editor.create(targetId, command.createKey ?? "")
      : editor.create(targetId, command.createKey ?? "", command.jsonValue?.value);
  }

  if (command.api === "insertAfter") {
    return command.jsonValue?.omitted ? editor.insertAfter(targetId) : editor.insertAfter(targetId, command.jsonValue?.value);
  }

  if (command.api === "insertBefore") {
    return command.jsonValue?.omitted ? editor.insertBefore(targetId) : editor.insertBefore(targetId, command.jsonValue?.value);
  }

  if (command.api === "appendChild") {
    return command.jsonValue?.omitted ? editor.appendChild(targetId) : editor.appendChild(targetId, command.jsonValue?.value);
  }

  if (command.api === "update") {
    return editor.update(targetId, command.updateValue ?? null);
  }

  if (command.api === "rename") {
    return editor.rename(targetId, command.renameKey ?? "");
  }

  if (command.api === "delete") {
    return editor.delete(targetId);
  }

  if (command.api === "deleteMany") {
    return editor.deleteMany(targetIds);
  }

  if (command.api === "copy") {
    return editor.copy(targetId);
  }

  if (command.api === "copyMany") {
    return editor.copyMany(targetIds);
  }

  if (command.api === "canCopyMany") {
    return editor.canCopyMany(targetIds);
  }

  if (command.api === "cut") {
    return editor.cut(targetId);
  }

  if (command.api === "cutMany") {
    return editor.cutMany(targetIds);
  }

  if (command.api === "canCutMany") {
    return editor.canCutMany(targetIds);
  }

  if (command.api === "paste") {
    return editor.paste(targetId, command.pasteOptions);
  }

  if (command.api === "canDeleteMany") {
    return editor.canDeleteMany(targetIds);
  }

  if (command.api === "canPaste") {
    return editor.canPaste(targetId, command.pasteOptions);
  }

  if (command.api === "canUndo") {
    return editor.canUndo();
  }

  if (command.api === "canRedo") {
    return editor.canRedo();
  }

  if (command.api === "subscribe") {
    return context.toggleSubscribe();
  }

  if (command.api === "undo") {
    return editor.undo();
  }

  return editor.redo();
}
