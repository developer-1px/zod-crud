import {
  trackPointer,
  type EntryKind,
  type JSONDocument,
  type JSONPatchOperation,
  type Pointer,
} from "zod-crud";

export type ExpansionStateErrorCode =
  | "invalid_pointer"
  | "not_expandable"
  | "path_not_found";

export interface ExpansionStateError {
  ok: false;
  code: ExpansionStateErrorCode;
  reason?: string;
  pointer: Pointer;
}

export interface ExpansionStateSnapshot {
  expanded: ReadonlyArray<Pointer>;
  count: number;
}

export interface ExpansionVisibleOptions {
  maxDepth?: number;
  includeRoot?: boolean;
}

export interface ExpansionVisibleNode {
  key: string;
  path: Pointer;
  depth: number;
  entryKind: EntryKind;
  childCount: number;
  expandable: boolean;
  expanded: boolean;
}

export type ExpansionStateResult =
  | { ok: true; snapshot: ExpansionStateSnapshot }
  | ExpansionStateError;

export type ExpansionVisibleResult =
  | { ok: true; nodes: ReadonlyArray<ExpansionVisibleNode> }
  | ExpansionStateError;

export type ExpansionStateListener = (snapshot: ExpansionStateSnapshot) => void;

export interface ExpansionState {
  current(): ExpansionStateSnapshot;
  isExpanded(pointer: Pointer): boolean;
  canExpand(pointer: Pointer): { ok: true } | ExpansionStateError;
  expand(pointer: Pointer): ExpansionStateResult;
  collapse(pointer: Pointer): ExpansionStateResult;
  toggle(pointer: Pointer): ExpansionStateResult;
  set(pointer: Pointer, expanded: boolean): ExpansionStateResult;
  clear(): void;
  visible(root?: Pointer, options?: ExpansionVisibleOptions): ExpansionVisibleResult;
  subscribe(listener: ExpansionStateListener): () => void;
  dispose(): void;
}

interface VisibleContext<T> {
  doc: JSONDocument<T>;
  expanded: ReadonlySet<Pointer>;
  nodes: ExpansionVisibleNode[];
  maxDepth: number;
}

export function createExpansionState<T>(
  doc: JSONDocument<T>,
  initialExpanded: ReadonlyArray<Pointer> = [],
): ExpansionState {
  const expanded = new Set<Pointer>();
  const listeners = new Set<ExpansionStateListener>();
  let disposed = false;

  for (const pointer of initialExpanded) {
    if (canExpandPointer(doc, pointer).ok) expanded.add(pointer);
  }

  const emitIfChanged = (before: string): void => {
    const after = snapshotSignature(expanded);
    if (before === after) return;
    emit(listeners, snapshot(expanded));
  };

  const unsubscribeDocument = doc.subscribe((applied) => {
    if (disposed || applied.length === 0 || expanded.size === 0) return;

    const before = snapshotSignature(expanded);
    const next = trackExpandedPointers(doc, expanded, applied);
    expanded.clear();
    for (const pointer of next) expanded.add(pointer);
    emitIfChanged(before);
  });

  return {
    current() {
      return snapshot(expanded);
    },
    isExpanded(pointer) {
      return expanded.has(pointer);
    },
    canExpand(pointer) {
      return canExpandPointer(doc, pointer);
    },
    expand(pointer) {
      const capability = canExpandPointer(doc, pointer);
      if (!capability.ok) return capability;

      const before = snapshotSignature(expanded);
      expanded.add(pointer);
      emitIfChanged(before);
      return { ok: true, snapshot: snapshot(expanded) };
    },
    collapse(pointer) {
      const read = doc.at(pointer);
      if (!read.ok) return expansionError(read.code, read.pointer, read.reason);

      const before = snapshotSignature(expanded);
      expanded.delete(pointer);
      emitIfChanged(before);
      return { ok: true, snapshot: snapshot(expanded) };
    },
    toggle(pointer) {
      return expanded.has(pointer) ? this.collapse(pointer) : this.expand(pointer);
    },
    set(pointer, isExpanded) {
      return isExpanded ? this.expand(pointer) : this.collapse(pointer);
    },
    clear() {
      const before = snapshotSignature(expanded);
      expanded.clear();
      emitIfChanged(before);
    },
    visible(root = "", options = {}) {
      const normalized = normalizeVisibleOptions(options);
      const nodes: ExpansionVisibleNode[] = [];
      const built = collectVisible({
        doc,
        expanded,
        nodes,
        maxDepth: normalized.maxDepth,
      }, root, "", 0, true);
      if (!built.ok) return built;

      return {
        ok: true,
        nodes: normalized.includeRoot ? copyVisibleNodes(nodes) : copyVisibleNodes(nodes.slice(1)),
      };
    },
    subscribe(listener) {
      if (disposed) return () => {};

      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose() {
      if (disposed) return;

      disposed = true;
      unsubscribeDocument();
      listeners.clear();
    },
  };
}

function canExpandPointer<T>(
  doc: JSONDocument<T>,
  pointer: Pointer,
): { ok: true } | ExpansionStateError {
  const entries = doc.entries(pointer);
  if (!entries.ok) return expansionError(entries.code, entries.pointer, entries.reason);
  if (!isExpandable(entries.kind)) {
    return {
      ok: false,
      code: "not_expandable",
      pointer: entries.path,
      reason: `pointer is not expandable: ${entries.path}`,
    };
  }
  return { ok: true };
}

function trackExpandedPointers<T>(
  doc: JSONDocument<T>,
  expanded: ReadonlySet<Pointer>,
  applied: ReadonlyArray<JSONPatchOperation>,
): Pointer[] {
  const next = new Set<Pointer>();
  for (const pointer of expanded) {
    const tracked = trackPointer(pointer, applied);
    if (tracked === null || !doc.exists(tracked)) continue;
    if (!canExpandPointer(doc, tracked).ok) continue;
    next.add(tracked);
  }
  return sortedPointers(next);
}

function collectVisible<T>(
  context: VisibleContext<T>,
  pointer: Pointer,
  key: string,
  depth: number,
  forceExpanded: boolean,
): { ok: true } | ExpansionStateError {
  const entries = context.doc.entries(pointer);
  if (!entries.ok) return expansionError(entries.code, entries.pointer, entries.reason);

  const expandable = isExpandable(entries.kind);
  const isExpanded = forceExpanded || context.expanded.has(entries.path);
  context.nodes.push({
    key,
    path: entries.path,
    depth,
    entryKind: entries.kind,
    childCount: entries.entries.length,
    expandable,
    expanded: expandable && isExpanded,
  });

  if (!expandable || !isExpanded || depth >= context.maxDepth) return { ok: true };

  for (const entry of entries.entries) {
    const child = collectVisible(context, entry.path, entry.key, depth + 1, false);
    if (!child.ok) return child;
  }
  return { ok: true };
}

function isExpandable(kind: EntryKind): boolean {
  return kind !== "primitive";
}

function snapshot(expanded: ReadonlySet<Pointer>): ExpansionStateSnapshot {
  const pointers = sortedPointers(expanded);
  return {
    expanded: pointers,
    count: pointers.length,
  };
}

function emit(
  listeners: Set<ExpansionStateListener>,
  value: ExpansionStateSnapshot,
): void {
  const event = copySnapshot(value);
  for (const listener of [...listeners]) {
    listener(event);
  }
}

function copySnapshot(value: ExpansionStateSnapshot): ExpansionStateSnapshot {
  return {
    expanded: [...value.expanded],
    count: value.count,
  };
}

function copyVisibleNodes(
  nodes: ReadonlyArray<ExpansionVisibleNode>,
): ReadonlyArray<ExpansionVisibleNode> {
  return nodes.map((node) => ({ ...node }));
}

function sortedPointers(pointers: ReadonlySet<Pointer>): Pointer[] {
  return [...pointers].sort((left, right) => left.localeCompare(right));
}

function snapshotSignature(expanded: ReadonlySet<Pointer>): string {
  return JSON.stringify(sortedPointers(expanded));
}

function normalizeVisibleOptions(options: ExpansionVisibleOptions): Required<ExpansionVisibleOptions> {
  return {
    includeRoot: options.includeRoot !== false,
    maxDepth: normalizeMaxDepth(options.maxDepth),
  };
}

function normalizeMaxDepth(maxDepth: number | undefined): number {
  if (maxDepth === undefined) return Number.POSITIVE_INFINITY;
  if (!Number.isFinite(maxDepth)) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.floor(maxDepth));
}

function expansionError(
  code: "invalid_pointer" | "path_not_found",
  pointer: Pointer,
  reason?: string,
): ExpansionStateError {
  return {
    ok: false,
    code,
    ...(reason !== undefined ? { reason } : {}),
    pointer,
  };
}
