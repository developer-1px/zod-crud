import { query as jsonpathQuery } from "../../../foundation/jsonpath/index.js";
import { JSONPathSyntaxError } from "../../../foundation/jsonpath/tokenize.js";
import type { JSONPatchOperation } from "../../../foundation/patch/contract.js";
import { removeSourcesPatch } from "../../../foundation/patch/source.js";
import type { Pointer } from "../../../foundation/pointer/index.js";
import {
  primaryPointer,
  selectedSource,
} from "../../../domain/selection/read.js";
import {
  EMPTY_SELECTION,
  type SelectionSnap,
} from "../../../domain/selection/snap.js";
import type { SelectionSource } from "../../../domain/selection/read.js";
import type { CapabilityResult } from "../can/result.js";

export type DocumentEditPlan =
  | { ok: true; operations: JSONPatchOperation[] }
  | Extract<CapabilityResult, { ok: false }>;

type DocumentPathValueArgs = { target?: Pointer; value: unknown };

export function resolvePathValueArgs(
  pathOrValue: Pointer | unknown,
  value: unknown,
  hasValueArg: boolean,
): DocumentPathValueArgs {
  return hasValueArg
    ? { target: pathOrValue as Pointer, value }
    : { value: pathOrValue };
}

export function planDocumentInsert(input: {
  selection?: SelectionSnap | null | undefined;
  pathOrValue: Pointer | unknown;
  value: unknown;
  hasValueArg: boolean;
}): DocumentEditPlan {
  const args = resolvePathValueArgs(input.pathOrValue, input.value, input.hasValueArg);
  const target = args.target ?? primaryPointer(input.selection ?? EMPTY_SELECTION) ?? null;
  return target === null
    ? emptySelectionCapability("insert target selection is empty")
    : { ok: true, operations: [{ op: "add", path: target, value: args.value }] };
}

export function planDocumentReplace(input: {
  state: unknown;
  selection?: SelectionSnap | null | undefined;
  pathOrValue: Pointer | unknown;
  value: unknown;
  hasValueArg: boolean;
}): DocumentEditPlan {
  const args = resolvePathValueArgs(input.pathOrValue, input.value, input.hasValueArg);
  const target = args.target ?? primaryPointer(input.selection ?? EMPTY_SELECTION) ?? null;
  if (target === null) return emptySelectionCapability("replace target selection is empty");
  if (!target.startsWith("$")) {
    return { ok: true, operations: [{ op: "replace", path: target, value: args.value }] };
  }

  let pointers: Pointer[];
  try {
    pointers = jsonpathQuery(target, input.state);
  } catch (error) {
    if (error instanceof JSONPathSyntaxError) {
      return { ok: false, code: "syntax_error", reason: error.message };
    }
    throw error;
  }

  return pointers.length === 0
    ? { ok: false, code: "empty_match", reason: `no matches for ${target}` }
    : {
        ok: true,
        operations: [...pointers]
          .sort((a, b) => b.length - a.length)
          .map((path) => ({ op: "replace", path, value: args.value })),
      };
}

export function planDocumentDelete(input: {
  selection?: SelectionSnap | null | undefined;
  source?: SelectionSource | undefined;
}): DocumentEditPlan {
  const resolved = input.source ?? selectedSource(input.selection ?? EMPTY_SELECTION) ?? null;
  if (resolved === null) return emptySelectionCapability("delete source selection is empty");

  const planned = removeSourcesPatch(resolved);
  if (!planned.ok) {
    return planned.code === "invalid_pointer"
      ? {
          ok: false,
          code: "invalid_pointer",
          reason: `invalid delete source pointer: ${planned.pointer}`,
          pointer: planned.pointer,
        }
      : emptySelectionCapability("delete source selection is empty");
  }
  return { ok: true, operations: planned.patch };
}

export function planDocumentMove(input: {
  selection?: SelectionSnap | null | undefined;
  sourceOrTarget: Pointer;
  target?: Pointer | undefined;
  hasSourceArg: boolean;
}): DocumentEditPlan {
  const source = input.hasSourceArg
    ? input.sourceOrTarget
    : primaryPointer(input.selection ?? EMPTY_SELECTION) ?? null;
  const target = input.hasSourceArg ? input.target! : input.sourceOrTarget;
  return source === null
    ? emptySelectionCapability("move source selection is empty")
    : { ok: true, operations: [{ op: "move", from: source, path: target }] };
}

function emptySelectionCapability(reason: string): Extract<CapabilityResult, { ok: false }> {
  return { ok: false, code: "empty_selection", reason };
}
