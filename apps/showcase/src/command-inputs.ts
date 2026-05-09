import type { ApiId } from "./api-catalog.js";
import {
  parseCreateKey,
  parseKey,
  parseOptionalJson,
  parsePasteOptions,
  parsePrimitiveDraft,
} from "./command-input-parsers.js";
import type {
  CommandDrafts,
  PreparedCommandResult,
} from "./command-input-types.js";

export type {
  CommandDrafts,
  OptionalJsonInput,
  PreparedCommand,
  PreparedCommandResult,
  UpdatePreview,
} from "./command-input-types.js";
export {
  parsePrimitiveDraft,
} from "./command-input-parsers.js";

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
