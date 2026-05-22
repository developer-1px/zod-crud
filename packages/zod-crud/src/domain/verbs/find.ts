// verbs/find — Selection 기둥의 어휘 확장 (RFC 9535 query → Pointer[]).
// pure. read-only.

import type { Pointer } from "../../foundation/json-pointer/index.js";
import { queryMatches as jsonpathQueryMatches, JSONPathSyntaxError } from "../../foundation/jsonpath/index.js";
import type { Match } from "../../foundation/jsonpath/index.js";

interface FindOk {
  ok: true;
  pointers: Pointer[];
  matches: Match[];
}

interface FindError {
  ok: false;
  code: "syntax_error";
  message: string;
}

export function find(state: unknown, jsonpath: string): FindOk | FindError {
  try {
    const matches = jsonpathQueryMatches(jsonpath, state);
    return {
      ok: true,
      pointers: matches.map((m) => m.pointer),
      matches,
    };
  } catch (e) {
    if (e instanceof JSONPathSyntaxError) {
      return { ok: false, code: "syntax_error", message: e.message };
    }
    throw e;
  }
}
