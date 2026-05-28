import {
  type JSONCapabilityResult,
  type JSONChangeMetadata,
  type JSONDocument,
  type JSONDocumentDuplicateOptions,
  type JSONDocumentPasteOptions,
  type JSONDocumentPasteTarget,
  type JSONPatchInput,
  type Pointer,
  type SelectionSource,
} from "zod-crud";

export type JSONCommandId =
  | "patch"
  | "find"
  | "insert"
  | "replace"
  | "delete"
  | "move"
  | "duplicate"
  | "copy"
  | "cut"
  | "paste"
  | "undo"
  | "redo";

export interface PatchCommandArgs {
  operations: JSONPatchInput;
  metadata?: JSONChangeMetadata;
}

export interface FindCommandArgs {
  jsonPath: string;
}

export interface ValueCommandArgs {
  path?: Pointer;
  value: unknown;
}

export interface SourceCommandArgs {
  source?: SelectionSource;
}

export interface MoveCommandArgs {
  source?: Pointer;
  target: Pointer;
}

export interface DuplicateCommandArgs {
  source?: Pointer;
  options?: JSONDocumentDuplicateOptions;
}

export interface PasteCommandArgs {
  target?: JSONDocumentPasteTarget;
  options?: JSONDocumentPasteOptions;
}

export type JSONCommandArgs =
  | PatchCommandArgs
  | FindCommandArgs
  | ValueCommandArgs
  | SourceCommandArgs
  | MoveCommandArgs
  | DuplicateCommandArgs
  | PasteCommandArgs
  | undefined;

export interface JSONCommandSpec {
  id: JSONCommandId;
  args?: unknown;
  label?: string;
  shortcut?: string;
}

export interface JSONCommandCapabilityError {
  ok: false;
  code: "invalid_args";
  reason: string;
}

export type JSONCommandCapabilityResult =
  | JSONCapabilityResult
  | JSONCommandCapabilityError;

export interface JSONCommandStatus {
  id: JSONCommandId;
  enabled: boolean;
  capability: JSONCommandCapabilityResult;
  label?: string;
  shortcut?: string;
}

export interface JSONCommandRunOk {
  ok: true;
  id: JSONCommandId;
  result: unknown;
}

export interface JSONCommandRunError {
  ok: false;
  id: JSONCommandId;
  code: "invalid_args" | "disabled" | "execution_failed";
  reason: string;
  capability?: JSONCommandCapabilityResult;
  result?: unknown;
}

export type JSONCommandRunResult =
  | JSONCommandRunOk
  | JSONCommandRunError;

export interface CommandState<TDocument> {
  can(id: JSONCommandId, args?: unknown): JSONCommandCapabilityResult;
  state(spec: JSONCommandSpec): JSONCommandStatus;
  list(specs: ReadonlyArray<JSONCommandSpec>): ReadonlyArray<JSONCommandStatus>;
  run(id: JSONCommandId, args?: unknown): JSONCommandRunResult;
}

interface PreparedCommand {
  ok: true;
  capability: JSONCapabilityResult;
  execute(): unknown;
}

export function createCommandState<TDocument>(
  doc: JSONDocument<TDocument>,
): CommandState<TDocument> {
  return {
    can(id, args) {
      return canCommand(doc, id, args);
    },
    state(spec) {
      return commandState(doc, spec);
    },
    list(specs) {
      return listCommandStates(doc, specs);
    },
    run(id, args) {
      return runCommand(doc, id, args);
    },
  };
}

export function canCommand<TDocument>(
  doc: JSONDocument<TDocument>,
  id: JSONCommandId,
  args?: unknown,
): JSONCommandCapabilityResult {
  const command = prepareCommand(doc, id, args);
  return command.ok ? command.capability : command;
}

export function commandState<TDocument>(
  doc: JSONDocument<TDocument>,
  spec: JSONCommandSpec,
): JSONCommandStatus {
  const capability = canCommand(doc, spec.id, spec.args);
  const status: JSONCommandStatus = {
    id: spec.id,
    enabled: capability.ok,
    capability,
  };
  if (spec.label !== undefined) status.label = spec.label;
  if (spec.shortcut !== undefined) status.shortcut = spec.shortcut;
  return status;
}

export function listCommandStates<TDocument>(
  doc: JSONDocument<TDocument>,
  specs: ReadonlyArray<JSONCommandSpec>,
): ReadonlyArray<JSONCommandStatus> {
  return specs.map((spec) => commandState(doc, spec));
}

export function runCommand<TDocument>(
  doc: JSONDocument<TDocument>,
  id: JSONCommandId,
  args?: unknown,
): JSONCommandRunResult {
  const command = prepareCommand(doc, id, args);
  if (!command.ok) {
    return {
      ok: false,
      id,
      code: "invalid_args",
      reason: command.reason,
      capability: command,
    };
  }
  if (!command.capability.ok) {
    return {
      ok: false,
      id,
      code: "disabled",
      reason: command.capability.reason ?? `${id} is disabled`,
      capability: command.capability,
    };
  }
  return normalizeRunResult(id, command.execute());
}

function prepareCommand<TDocument>(
  doc: JSONDocument<TDocument>,
  id: JSONCommandId,
  args?: unknown,
): PreparedCommand | JSONCommandCapabilityError {
  switch (id) {
    case "patch": {
      const parsed = requireRecord(id, args);
      if (!parsed.ok) return parsed;
      if (!Object.prototype.hasOwnProperty.call(parsed.args, "operations")) {
        return invalidArgs(id, "patch command requires operations");
      }
      const operations = parsed.args.operations as JSONPatchInput;
      const metadata = parsed.args.metadata as JSONChangeMetadata | undefined;
      return {
        ok: true,
        capability: doc.canPatch(operations),
        execute: () => doc.patch(operations, metadata),
      };
    }
    case "find": {
      const parsed = requireRecord(id, args);
      if (!parsed.ok) return parsed;
      if (typeof parsed.args.jsonPath !== "string") {
        return invalidArgs(id, "find command requires jsonPath");
      }
      const jsonPath = parsed.args.jsonPath;
      return {
        ok: true,
        capability: doc.canFind(jsonPath),
        execute: () => doc.find(jsonPath),
      };
    }
    case "insert": {
      const parsed = requireValueCommand(id, args);
      if (!parsed.ok) return parsed;
      return {
        ok: true,
        capability: parsed.path === undefined
          ? doc.canInsert(parsed.value)
          : doc.canInsert(parsed.path, parsed.value),
        execute: () => parsed.path === undefined
          ? doc.insert(parsed.value)
          : doc.insert(parsed.path, parsed.value),
      };
    }
    case "replace": {
      const parsed = requireValueCommand(id, args);
      if (!parsed.ok) return parsed;
      return {
        ok: true,
        capability: parsed.path === undefined
          ? doc.canReplace(parsed.value)
          : doc.canReplace(parsed.path, parsed.value),
        execute: () => parsed.path === undefined
          ? doc.replace(parsed.value)
          : doc.replace(parsed.path, parsed.value),
      };
    }
    case "delete": {
      const source = optionalRecord(args)?.source as SelectionSource | undefined;
      return {
        ok: true,
        capability: doc.canDelete(source),
        execute: () => doc.delete(source),
      };
    }
    case "move": {
      const parsed = requireRecord(id, args);
      if (!parsed.ok) return parsed;
      if (typeof parsed.args.target !== "string") {
        return invalidArgs(id, "move command requires target");
      }
      const target = parsed.args.target;
      const source = typeof parsed.args.source === "string" ? parsed.args.source : undefined;
      return {
        ok: true,
        capability: source === undefined
          ? doc.canMove(target)
          : doc.canMove(source, target),
        execute: () => source === undefined
          ? doc.move(target)
          : doc.move(source, target),
      };
    }
    case "duplicate": {
      const record = optionalRecord(args);
      const source = typeof record?.source === "string" ? record.source : undefined;
      const options = record?.options as JSONDocumentDuplicateOptions | undefined;
      return {
        ok: true,
        capability: source === undefined
          ? doc.canDuplicate(options)
          : doc.canDuplicate(source, options),
        execute: () => source === undefined
          ? doc.duplicate(options)
          : doc.duplicate(source, options),
      };
    }
    case "copy": {
      const source = optionalRecord(args)?.source as SelectionSource | undefined;
      return {
        ok: true,
        capability: doc.canCopy(source),
        execute: () => doc.copy(source),
      };
    }
    case "cut": {
      const source = optionalRecord(args)?.source as SelectionSource | undefined;
      return {
        ok: true,
        capability: doc.canCut(source),
        execute: () => doc.cut(source),
      };
    }
    case "paste": {
      const record = optionalRecord(args);
      const target = record?.target as JSONDocumentPasteTarget | undefined;
      const options = record?.options as JSONDocumentPasteOptions | undefined;
      return {
        ok: true,
        capability: doc.canPaste(target, options),
        execute: () => doc.paste(target, options),
      };
    }
    case "undo":
      return {
        ok: true,
        capability: doc.canUndo(),
        execute: () => doc.undo(),
      };
    case "redo":
      return {
        ok: true,
        capability: doc.canRedo(),
        execute: () => doc.redo(),
      };
  }
}

function requireValueCommand(
  id: JSONCommandId,
  args: unknown,
): { ok: true; path: Pointer | undefined; value: unknown } | JSONCommandCapabilityError {
  const parsed = requireRecord(id, args);
  if (!parsed.ok) return parsed;
  if (!Object.prototype.hasOwnProperty.call(parsed.args, "value")) {
    return invalidArgs(id, `${id} command requires value`);
  }
  const path = typeof parsed.args.path === "string" ? parsed.args.path : undefined;
  return {
    ok: true,
    path,
    value: parsed.args.value,
  };
}

function requireRecord(
  id: JSONCommandId,
  args: unknown,
): { ok: true; args: Record<string, unknown> } | JSONCommandCapabilityError {
  if (!isRecord(args)) return invalidArgs(id, `${id} command requires args`);
  return { ok: true, args };
}

function optionalRecord(args: unknown): Record<string, unknown> | undefined {
  return isRecord(args) ? args : undefined;
}

function normalizeRunResult(
  id: JSONCommandId,
  result: unknown,
): JSONCommandRunResult {
  if (typeof result === "boolean") {
    return result
      ? { ok: true, id, result }
      : {
          ok: false,
          id,
          code: "execution_failed",
          reason: `${id} returned false`,
          result,
        };
  }
  if (isRecord(result) && result.ok === false) {
    return {
      ok: false,
      id,
      code: "execution_failed",
      reason: typeof result.reason === "string" ? result.reason : `${id} failed`,
      result,
    };
  }
  return { ok: true, id, result };
}

function invalidArgs(
  id: JSONCommandId,
  reason: string,
): JSONCommandCapabilityError {
  return {
    ok: false,
    code: "invalid_args",
    reason: `${id}: ${reason}`,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
