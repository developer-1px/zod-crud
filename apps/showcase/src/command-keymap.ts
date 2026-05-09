import type { ApiId } from "./api-catalog.js";

export function keymapLabel(api: ApiId): string {
  const labels: Partial<Record<ApiId, string>> = {
    copy: "Cmd/Ctrl+C",
    copyMany: "Cmd/Ctrl+C",
    cut: "Cmd/Ctrl+X",
    cutMany: "Cmd/Ctrl+X",
    paste: "Cmd/Ctrl+V",
    delete: "Delete",
    deleteMany: "Delete",
    undo: "Cmd/Ctrl+Z",
    redo: "Cmd/Ctrl+Shift+Z / Cmd/Ctrl+Y",
    update: "Enter inline",
  };

  return labels[api] ?? "";
}

export function resolveKeyboardApi(event: {
  altKey: boolean;
  ctrlKey: boolean;
  key: string;
  metaKey: boolean;
  shiftKey: boolean;
}, selectedCount: number): ApiId | null {
  const commandKey = event.metaKey || event.ctrlKey;
  const key = event.key.toLowerCase();
  const many = selectedCount > 1;

  if (commandKey && event.altKey) {
    return null;
  }

  if (commandKey && key === "c") {
    return many ? "copyMany" : "copy";
  }

  if (commandKey && key === "x") {
    return many ? "cutMany" : "cut";
  }

  if (commandKey && key === "v") {
    return "paste";
  }

  if (commandKey && key === "z") {
    return event.shiftKey ? "redo" : "undo";
  }

  if (commandKey && key === "y") {
    return "redo";
  }

  if (event.key === "Delete" || event.key === "Backspace") {
    return many ? "deleteMany" : "delete";
  }

  return null;
}
