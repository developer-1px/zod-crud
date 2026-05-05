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

export function prepareUserCommand(api: ApiId, drafts: CommandDrafts): PreparedCommandResult {
  try {
    if (api === "find") {
      return { ok: true, command: { api, findKey: parseKey(drafts.findKeyDraft) } };
    }

    if (api === "create") {
      return {
        ok: true,
        command: {
          api,
          createKey: parseCreateKey(drafts.keyDraft),
          jsonValue: parseOptionalJson(drafts.jsonValueDraft),
        },
      };
    }

    if (api === "insertAfter" || api === "insertBefore" || api === "appendChild") {
      return { ok: true, command: { api, jsonValue: parseOptionalJson(drafts.jsonValueDraft) } };
    }

    if (api === "update") {
      if (drafts.updatePreview.state !== "valid") {
        return { ok: false, output: { ok: false, reason: drafts.updatePreview.message } };
      }

      return { ok: true, command: { api, updateValue: drafts.updatePreview.value } };
    }

    if (api === "rename") {
      return { ok: true, command: { api, renameKey: drafts.keyDraft } };
    }

    if (api === "paste" || api === "canPaste") {
      return { ok: true, command: { api, pasteOptions: parsePasteOptions(drafts.pasteMode, drafts.pasteIndexDraft) } };
    }

    return { ok: true, command: { api } };
  } catch (error) {
    return {
      ok: false,
      output: {
        ok: false,
        reason: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

export function parsePrimitiveDraft(
  node: { type: string },
  draft: string,
): { ok: true; value: JsonValue } | { ok: false; reason: string } {
  if (node.type === "string") {
    return { ok: true, value: draft };
  }

  if (node.type === "number") {
    const value = Number(draft);

    return Number.isFinite(value)
      ? { ok: true, value }
      : { ok: false, reason: "Number value must be finite." };
  }

  if (node.type === "boolean") {
    if (draft === "true") {
      return { ok: true, value: true };
    }

    if (draft === "false") {
      return { ok: true, value: false };
    }

    return { ok: false, reason: "Boolean value must be true or false." };
  }

  if (draft === "" || draft === "null") {
    return { ok: true, value: null };
  }

  return { ok: false, reason: "Null value must stay null." };
}

function parseOptionalJson(draft: string): OptionalJsonInput {
  if (draft.trim() === "") {
    return { omitted: true };
  }

  return {
    omitted: false,
    value: JSON.parse(draft) as JsonValue,
  };
}

function parsePasteOptions(mode: PasteMode, indexDraft: string): { mode: PasteMode; index?: number } {
  const index = indexDraft.trim() === "" ? undefined : Number(indexDraft);

  return {
    mode,
    ...(index === undefined || !Number.isInteger(index) ? {} : { index }),
  };
}

function parseKey(value: string): JsonKey {
  const trimmed = value.trim();

  if (/^-?\d+$/.test(trimmed)) {
    return Number(trimmed);
  }

  return value;
}

function parseCreateKey(value: string): string | number {
  const key = parseKey(value);

  if (key === null) {
    throw new Error("Create key cannot be null.");
  }

  return key;
}
