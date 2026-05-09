import type {
  JsonKey,
  JsonValue,
  OperationResult,
  PasteMode,
} from "zod-crud";

import type { ApiId } from "./api-catalog.js";

export type UpdatePreview =
  | { state: "idle"; message: string }
  | { state: "valid"; value: JsonValue; result: OperationResult }
  | { state: "invalid"; message: string; result?: OperationResult };

export type CommandDrafts = {
  findKeyDraft: string;
  jsonValueDraft: string;
  keyDraft: string;
  pasteIndexDraft: string;
  pasteMode: PasteMode;
  updatePreview: UpdatePreview;
};

export type OptionalJsonInput =
  | { omitted: true }
  | { omitted: false; value: JsonValue };

export type PreparedCommand = {
  api: ApiId;
  createKey?: string | number;
  findKey?: JsonKey;
  jsonValue?: OptionalJsonInput;
  pasteOptions?: {
    mode: PasteMode;
    index?: number;
  };
  renameKey?: string;
  updateValue?: JsonValue;
};

export type PreparedCommandResult =
  | { ok: true; command: PreparedCommand }
  | { ok: false; output: OperationResult };
