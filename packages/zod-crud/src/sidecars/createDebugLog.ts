// Headless debug log sidecar.
// Captures JSON ops, state snapshots, selection snapshots, and custom events.

import { cloneJson } from "../core/json.js";
import type { JSONPatchOperation } from "../core/patch/index.js";
import { isCollapsed, selectionType } from "../core/selection/index.js";
import type { JSONOps } from "../jsonOps.js";
import type { SelectionState } from "../selection.js";
import type { SelectionSnap } from "../core/selection/index.js";

export interface DebugEvent {
  t: number;
  kind: string;
  data?: Record<string, unknown>;
}

export interface DebugLog<T> {
  startedAt: number;
  initialState: T;
  events: DebugEvent[];
}

export interface DebugLogger {
  enabled: boolean;
  log(kind: string, data?: Record<string, unknown>): void;
}

export interface DebugLogApi<T> extends DebugLogger {
  events: ReadonlyArray<DebugEvent>;
  start(): void;
  stop(): DebugLog<T>;
  clear(): void;
}

export interface HeadlessDebugLogApi<T> extends DebugLogApi<T> {
  dispose(): void;
}

export interface CreateDebugLogOptions {
  now?: () => number;
  onChange?: () => void;
}

export function createDebugLog<T>(
  ops: JSONOps<T>,
  options?: CreateDebugLogOptions,
): HeadlessDebugLogApi<T>;
export function createDebugLog<T>(
  ops: JSONOps<T>,
  selection?: SelectionState<T>,
  options?: CreateDebugLogOptions,
): HeadlessDebugLogApi<T>;
export function createDebugLog<T>(
  ops: JSONOps<T>,
  selectionOrOptions?: SelectionState<T> | CreateDebugLogOptions,
  maybeOptions: CreateDebugLogOptions = {},
): HeadlessDebugLogApi<T> {
  const selection = isSelectionState(selectionOrOptions) ? selectionOrOptions : undefined;
  const options = isSelectionState(selectionOrOptions)
    ? maybeOptions
    : arguments.length >= 3
      ? maybeOptions
      : selectionOrOptions ?? {};
  const now = options.now ?? Date.now;
  let startedAt: number | null = null;
  let initialState: T | null = null;
  let events: DebugEvent[] = [];
  let lastState: T | null = null;
  let unsubscribeOps: (() => void) | null = null;
  let unsubscribeSelection: (() => void) | null = null;

  const emit = (): void => {
    options.onChange?.();
  };
  const push = (kind: string, data?: Record<string, unknown>): void => {
    if (startedAt === null) return;
    const event: DebugEvent = { t: now() - startedAt, kind };
    if (data !== undefined) event.data = cloneJson(data);
    events.push(event);
    emit();
  };
  const pushSelection = (snapshot: SelectionSnap): void => {
    push("selection", {
      ranges: [...snapshot.ranges],
      selectedPointers: [...snapshot.selectedPointers],
      selectionRanges: [...snapshot.selectionRanges],
      primaryIndex: snapshot.primaryIndex,
      anchor: snapshot.anchor,
      focus: snapshot.focus,
      isCollapsed: isCollapsed(snapshot),
      type: selectionType(snapshot),
    });
  };
  const stopSubscriptions = (): void => {
    unsubscribeOps?.();
    unsubscribeSelection?.();
    unsubscribeOps = null;
    unsubscribeSelection = null;
  };
  const startSubscriptions = (): void => {
    if (!unsubscribeOps) {
      unsubscribeOps = ops.subscribe((applied) => {
        const before = lastState;
        const after = cloneJson(ops.state);
        lastState = after;
        push("commit", { applied: [...applied] as JSONPatchOperation[], before, after });
      });
    }
    if (selection && !unsubscribeSelection) {
      unsubscribeSelection = selection.subscribe((snapshot) => {
        pushSelection(snapshot);
      });
    }
  };

  return {
    get enabled() { return startedAt !== null; },
    get events() { return cloneJson(events); },
    log: push,
    start() {
      if (startedAt !== null) return;
      startedAt = now();
      initialState = cloneJson(ops.state);
      lastState = cloneJson(ops.state);
      events = [];
      startSubscriptions();
      if (selection) pushSelection(selection.snapshot());
      emit();
    },
    stop() {
      const out: DebugLog<T> = {
        startedAt: startedAt ?? now(),
        initialState: cloneJson((initialState ?? ops.state) as T),
        events: cloneJson(events),
      };
      startedAt = null;
      initialState = null;
      lastState = null;
      stopSubscriptions();
      emit();
      return out;
    },
    clear() {
      events = [];
      if (startedAt !== null) {
        startedAt = now();
        initialState = cloneJson(ops.state);
        lastState = cloneJson(ops.state);
      }
      emit();
    },
    dispose() {
      startedAt = null;
      initialState = null;
      lastState = null;
      stopSubscriptions();
      emit();
    },
  };
}

function isSelectionState<T>(value: unknown): value is SelectionState<T> {
  return typeof value === "object"
    && value !== null
    && typeof (value as SelectionState<T>).snapshot === "function"
    && typeof (value as SelectionState<T>).subscribe === "function";
}
