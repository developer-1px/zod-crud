import type { OperationResult } from "zod-crud";

export type CommandId = "copy" | "cut" | "paste" | "delete" | "undo" | "redo";

export const commands: Array<{ id: CommandId; keys: string; operation: string }> = [
  { id: "copy", keys: "Cmd+C", operation: "copy(selection)" },
  { id: "cut", keys: "Cmd+X", operation: "cut(selection)" },
  { id: "paste", keys: "Cmd+V", operation: "paste(row)" },
  { id: "delete", keys: "Delete", operation: "delete(selection)" },
  { id: "undo", keys: "Cmd+Z", operation: "undo()" },
  { id: "redo", keys: "Cmd+Shift+Z", operation: "redo()" },
];

export function CommandStrip({
  activeCommand,
  canCopy,
  canCut,
  canDelete,
  canPaste,
  onCommand,
}: {
  activeCommand: string;
  canCopy: OperationResult;
  canCut: OperationResult;
  canDelete: OperationResult;
  canPaste: OperationResult;
  onCommand: (command: CommandId) => void;
}) {
  const availability: Partial<Record<CommandId, OperationResult>> = {
    copy: canCopy,
    cut: canCut,
    delete: canDelete,
    paste: canPaste,
  };

  return (
    <section className="command-strip" aria-label="Keyboard command results">
      {commands.map((command) => {
        const status = availability[command.id];
        const disabled = status?.ok === false;

        return (
          <button
            key={command.id}
            type="button"
            className={activeCommand === command.id ? "command-card is-active" : "command-card"}
            onClick={() => onCommand(command.id)}
            disabled={disabled}
            title={status?.ok === false ? status.reason : undefined}
          >
            <kbd>{command.keys}</kbd>
            <span>{command.operation}</span>
            {status === undefined ? null : (
              <small className={status.ok ? "command-status ok" : "command-status error"}>
                {status.ok ? `${canLabel(command.id)}.ok true` : status.reason}
              </small>
            )}
          </button>
        );
      })}
    </section>
  );
}

function canLabel(command: CommandId): string {
  if (command === "copy") {
    return "canCopyMany";
  }

  if (command === "cut") {
    return "canCutMany";
  }

  if (command === "delete") {
    return "canDeleteMany";
  }

  return "canPaste";
}
