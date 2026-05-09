import type { ApiId } from "./api-catalog.js";
import type { CommandInputKind } from "./command-types.js";

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
