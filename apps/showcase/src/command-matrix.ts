import {
  apiCallLabel,
  apiGroups,
  type ApiId,
} from "./api-catalog.js";
import {
  commandInputKind,
  commandInputLabel,
} from "./command-input-kind.js";
import {
  keymapLabel,
  resolveKeyboardApi,
} from "./command-keymap.js";
import { commandNotes } from "./command-notes.js";
import type { UserCommand } from "./command-types.js";

export type {
  CommandInputKind,
  UserCommand,
} from "./command-types.js";
export {
  commandInputKind,
  commandInputLabel,
} from "./command-input-kind.js";
export {
  keymapLabel,
  resolveKeyboardApi,
} from "./command-keymap.js";

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
