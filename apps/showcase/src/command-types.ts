import type { ApiId } from "./api-catalog.js";

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
