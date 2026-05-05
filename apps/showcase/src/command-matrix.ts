import {
  apiCallLabel,
  apiGroups,
  type ApiId,
} from "./api-catalog.js";

export type CommandInputKind =
  | "none"
  | "find-key"
  | "child-key"
  | "child-key-json"
  | "object-key"
  | "json-value"
  | "primitive-value"
  | "paste-options";

export type UserCommand = {
  api: ApiId;
  group: string;
  call: string;
  keys: string;
  input: CommandInputKind;
  notes: string;
};

export const userCommands: UserCommand[] = apiGroups.flatMap((group) =>
  group.apis.map((api) => ({
    api: api.id,
    group: group.title,
    call: api.call,
    keys: keymapLabel(api.id),
    input: commandInputKind(api.id),
    notes: commandNotes(api.id),
  })),
);

export function commandByApi(api: ApiId): UserCommand {
  return userCommands.find((command) => command.api === api) ?? {
    api,
    group: "Unknown",
    call: apiCallLabel(api),
    keys: "",
    input: "none",
    notes: "",
  };
}

export function commandInputLabel(input: CommandInputKind): string {
  const labels: Record<CommandInputKind, string> = {
    none: "-",
    "find-key": "find key",
    "child-key": "child key/index",
    "child-key-json": "child key/index + optional JSON",
    "object-key": "object key",
    "json-value": "optional JSON",
    "primitive-value": "primitive value",
    "paste-options": "paste mode/index",
  };

  return labels[input];
}

export function commandInputKind(api: ApiId): CommandInputKind {
  if (api === "find") {
    return "find-key";
  }

  if (api === "create") {
    return "child-key-json";
  }

  if (api === "rename") {
    return "object-key";
  }

  if (["insertAfter", "insertBefore", "appendChild"].includes(api)) {
    return "json-value";
  }

  if (api === "update") {
    return "primitive-value";
  }

  if (api === "paste" || api === "canPaste") {
    return "paste-options";
  }

  return "none";
}

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

function commandNotes(api: ApiId): string {
  const notes: Partial<Record<ApiId, string>> = {
    copyMany: "Uses visible row multi-selection.",
    cutMany: "Batch cut succeeds only when selected nodes can move as one batch.",
    deleteMany: "One call, one commit, one focus result.",
    canDeleteMany: "Dry run; no document, clipboard, or history mutation.",
    canCutMany: "Facade over batch delete capability.",
    paste: "Uses clipboard from copy/copyMany/cut/cutMany.",
    subscribe: "Toggles listener registration.",
    update: "Inline edit is the primary user command; manual run uses the same call.",
  };

  return notes[api] ?? "";
}
