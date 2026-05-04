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
  canCopy: boolean;
  canCut: boolean;
  canDelete: boolean;
  canPaste: boolean;
  onCommand: (command: CommandId) => void;
}) {
  return (
    <section className="command-strip" aria-label="Keyboard command results">
      {commands.map((command) => (
        <button
          key={command.id}
          type="button"
          className={activeCommand === command.id ? "command-card is-active" : "command-card"}
          onClick={() => onCommand(command.id)}
          disabled={
            (command.id === "copy" && !canCopy) ||
            (command.id === "cut" && !canCut) ||
            (command.id === "delete" && !canDelete) ||
            (command.id === "paste" && !canPaste)
          }
        >
          <kbd>{command.keys}</kbd>
          <span>{command.operation}</span>
        </button>
      ))}
    </section>
  );
}
