import type {
  JsonKey,
  JsonValue,
  PasteMode,
} from "zod-crud";

import type { OptionalJsonInput } from "./command-input-types.js";

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

export function parseOptionalJson(draft: string): OptionalJsonInput {
  if (draft.trim() === "") {
    return { omitted: true };
  }

  return {
    omitted: false,
    value: JSON.parse(draft) as JsonValue,
  };
}

export function parsePasteOptions(mode: PasteMode, indexDraft: string): { mode: PasteMode; index?: number } {
  const index = indexDraft.trim() === "" ? undefined : Number(indexDraft);

  return {
    mode,
    ...(index === undefined || !Number.isInteger(index) ? {} : { index }),
  };
}

export function parseKey(value: string): JsonKey {
  const trimmed = value.trim();

  if (/^-?\d+$/.test(trimmed)) {
    return Number(trimmed);
  }

  return value;
}

export function parseCreateKey(value: string): string | number {
  const key = parseKey(value);

  if (key === null) {
    throw new Error("Create key cannot be null.");
  }

  return key;
}
