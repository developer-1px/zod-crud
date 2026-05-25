import { JSONPathSyntaxError, parse as parseJSONPath } from "../../foundation/jsonpath/index.js";
import {
  OK,
  type CapabilityResult,
} from "./capabilityTypes.js";

export function canDocumentFind(jsonpath: string): CapabilityResult {
  try {
    parseJSONPath(jsonpath);
    return OK;
  } catch (error) {
    if (error instanceof JSONPathSyntaxError) {
      return { ok: false, code: "syntax_error", reason: error.message };
    }
    throw error;
  }
}
