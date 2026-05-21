import { useMemo, useState, type ReactNode } from "react";
import { z } from "zod";
import {
  appendSegment,
  applyOperation,
  applyPatch,
  buildPointer,
  createClipboard,
  createJSONDocument,
  createSelection,
  escapeSegment,
  parentPointer,
  parsePointer,
  trackPointer,
  unescapeSegment,
  type JSONPatchOperation,
  type JSONOps,
  type Pointer,
} from "zod-crud";
import { useJSONDocument } from "zod-crud/react";

const Card = z.object({
  id: z.string(),
  title: z.string().min(1),
  status: z.enum(["todo", "doing", "done"]),
  points: z.number().int().min(0).max(13),
  tags: z.array(z.string().min(1)),
});

const BoardSchema = z.object({
  title: z.string().min(1),
  settings: z.object({
    archived: z.boolean(),
    owner: z.string().min(1),
  }),
  lists: z.array(z.object({
    id: z.string(),
    name: z.string().min(1),
    cards: z.array(Card),
  })),
});

type Board = z.infer<typeof BoardSchema>;
type BenchResult = { label: string; value: unknown };

const API_REFERENCE = [
  {
    title: "zod-crud",
    code: `import {
  JSONCrudError,
  createJSONDocument,
  createSelection,
  createClipboard,
  applyOperation,
  applyPatch,
  parsePointer,
  tryParsePointer,
  buildPointer,
  escapeSegment,
  unescapeSegment,
  PointerSyntaxError,
  parentPointer,
  lastSegment,
  lastSegmentIndex,
  appendSegment,
  withLastSegment,
  trackPointer,
  type JSONOps,
  type JSONDocument,
  type SelectionState,
  type JSONPatchOperation,
  type JSONResult,
  type Pointer,
  type JSONPoint,
  type SelectionAction,
  type SelectionRange,
  type SelectionSnap,
} from "zod-crud";`,
  },
  {
    title: "JSONDocument<T>",
    code: `type JSONDocument<T> = {
  readonly value: T;
  readonly lastPatch: readonly JSONPatchOperation[];
  readonly selection: SelectionState<T> | undefined;
  readonly history: {
    readonly canUndo: boolean;
    readonly canRedo: boolean;
    readonly undoDepth: number;
    readonly redoDepth: number;
    mergeLast(options?: { mergeKey?: string }): boolean;
    transaction(fn: () => void): void;
    transaction(options: HistoryTransactionOptions, fn: () => void): void;
  };
  readonly ops: JSONOps<T>;
  readonly commands: Commands<T>;
  readonly can: Can<T>;
  readonly check: Check<T>;
  readonly clipboard: ClipboardState<T>;
  readonly schema: SchemaState<T>;
  commit(ops: readonly JSONPatchOperation[], options?: CommitOptions): JSONResult;
  at(path: Pointer): ReadResult;
  exists(path: Pointer): boolean;
  query(jsonpath: string): QueryResult;
  entries(path: Pointer): EntriesResult;
};`,
  },
  {
    title: "JSONOps<T>",
    code: `type JSONOps<T> = {
  add(path, value): JSONResult;
  remove(path): JSONResult;
  replace(path, value): JSONResult;
  move(from, path): JSONResult;
  copy(from, path): JSONResult;
  test(path, value): JSONResult;
  patch(ops, metadata?): JSONResult;
  load(value, options?): JSONResult;
  reset(value?): JSONResult;
  subscribe(listener): () => void;
  readonly state: T;
};`,
  },
  {
    title: "Commands<T>",
    code: `type Commands<T> = {
  select(action, mode?): SelectionSnap;
  selectScope(options?): SelectionScopeResult;
  moveCursor(direction, options?): SelectionCursorResult;
  extendCursor(direction, options?): SelectionCursorResult;
  find(jsonpath): FindResult;
  move(fromOrTo, to?): MoveResult<T>;
  duplicate(sourceOrOpts?, opts?): DuplicateResult<T>;
  remove(source?): RemoveResult;
  replace(pathOrValue, value?): ReplaceResult<T>;
  replaceText(replacement, options?): ReplaceTextResult;
  deleteText(options?): DeleteTextResult;
  cut(source?): CutResult<T>;
  copy(source?): CopyResult;
  paste(payload, targetOrMode?, modeOrOptions?, options?): PasteResult<T>;
  undo(): boolean;
  redo(): boolean;
};`,
  },
  {
    title: "SelectionState<T>",
    code: `type SelectionState<T> = SelectionSnap & {
  readonly rangeCount: number;
  readonly selectedCount: number;
  readonly hasSelection: boolean;
  readonly isCollapsed: boolean;
  readonly type: SelectionType;
  readonly primaryRange: SelectionRange | null;
  readonly anchorPointer: Pointer | null;
  readonly focusPointer: Pointer | null;
  readonly selectedSource: SelectionSource | null;
  readonly primaryPointer: Pointer | null;
  readonly caret: JSONPoint | null;
  readonly caretPointer: Pointer | null;
  readonly context: SelectionContext | undefined;
  collapse(point): void;
  setBaseAndExtent(anchor, focus): void;
  extend(point): void;
  addRange(pointOrRange): void;
  removeRange(pointOrRangeOrIndex): void;
  toggleRange(pointOrRange): void;
  togglePointer(pointer): void;
  moveCursor(direction, options?): SelectionCursorResult;
  extendCursor(direction, options?): SelectionCursorResult;
  resolveCursor(direction, options?): SelectionCursorResult;
  orderPrimaryRange(options?): SelectionRangeOrderResult;
  orderRanges(options?): SelectionRangesOrderResult;
  spansForPointer(pointer, options?): SelectionPointerSpansResult;
  textEdits(replacement, options?): SelectionTextEditsResult;
  textPatch(replacement, options?): ReplaceSelectionTextResult;
  deleteText(options?): DeleteSelectionTextResult;
  selectScope(options?): SelectionScopeResult;
  resolveScope(options?): SelectionScopeTarget;
  selectRanges(ranges, anchor?, focus?, primaryIndex?): void;
  setContext(context): void;
  clearContext(): void;
  empty(): void;
  isSelected(pointer): boolean;
  snapshot(): SelectionSnap;
  toJSON(): SelectionSnap;
  restore(snapshot): void;
  subscribe(listener): () => void;
};`,
  },
  {
    title: "ClipboardState<T>",
    code: `type ClipboardState<T> = {
  readonly hasData: boolean;
  readonly source: Pointer | null;
  readonly sources: readonly Pointer[] | null;
  read(): ClipboardReadResult;
  write(payload, options?): JSONResult;
  clear(): void;
  copy(source?): CopyResult;
  cut(source?): CutResult<T>;
  paste(targetOrMode?, modeOrOptions?, options?): ClipboardPasteResult<T>;
};`,
  },
  {
    title: "Check / Can / SchemaState",
    code: `type Check<T> = {
  selectScope(options?): CheckResult;
  moveCursor(direction, options?): CheckResult;
  extendCursor(direction, options?): CheckResult;
  find(jsonpath): CheckResult;
  move(fromOrTo, to?): CheckResult;
  duplicate(sourceOrOpts?, opts?): CheckResult;
  remove(source?): CheckResult;
  replace(pathOrValue, value?): CheckResult;
  replaceText(replacement, options?): CheckResult;
  deleteText(options?): CheckResult;
  cut(source?): CheckResult;
  copy(source?): CheckResult;
  paste(payload, targetOrMode?, modeOrOptions?, options?): CheckResult;
  patch(ops): CheckResult;
  readonly undo: CheckResult;
  readonly redo: CheckResult;
};

type Can<T> = {
  selectScope(options?): boolean;
  moveCursor(direction, options?): boolean;
  extendCursor(direction, options?): boolean;
  find(jsonpath): boolean;
  move(fromOrTo, to?): boolean;
  duplicate(sourceOrOpts?, opts?): boolean;
  remove(source?): boolean;
  replace(pathOrValue, value?): boolean;
  replaceText(replacement, options?): boolean;
  deleteText(options?): boolean;
  cut(source?): boolean;
  copy(source?): boolean;
  paste(payload, targetOrMode?, modeOrOptions?, options?): boolean;
  readonly undo: boolean;
  readonly redo: boolean;
};

type SchemaState<T> = {
  at(path, mode?): SchemaQueryResult;
  kind(path, mode?): SchemaKindResult;
  accepts(path, value, mode?): CheckResult;
  describe(path, mode?): SchemaDescriptionResult;
};`,
  },
  {
    title: "zod-crud/react",
    code: `import { useJSONDocument } from "zod-crud/react";

const doc = useJSONDocument(schema, initial, {
  strict?: boolean;
  onError?: (error: JSONCrudError) => void;
  history?: number;
  selection?: boolean | UseSelectionOptions;
  onChange?: () => void;
});`,
  },
] as const;

const initialBoard: Board = {
  title: "Workbench board",
  settings: { archived: false, owner: "core" },
  lists: [
    {
      id: "todo",
      name: "Todo",
      cards: [
        { id: "c1", title: "Patch API", status: "todo", points: 2, tags: ["ops"] },
        { id: "c2", title: "Selection API", status: "todo", points: 3, tags: ["selection"] },
      ],
    },
    {
      id: "doing",
      name: "Doing",
      cards: [
        { id: "c3", title: "Clipboard API", status: "doing", points: 5, tags: ["clipboard"] },
      ],
    },
  ],
};

const sampleCard: Board["lists"][number]["cards"][number] = {
  id: "new",
  title: "Inserted card",
  status: "todo",
  points: 1,
  tags: ["new"],
};

const invalidCard = {
  id: "bad",
  title: "",
  status: "blocked",
  points: -1,
  tags: [],
};

function cardPointer(listIndex: number, cardIndex: number): Pointer {
  return `/lists/${listIndex}/cards/${cardIndex}` as Pointer;
}

function stringify(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function parseJson(value: string): { ok: true; value: unknown } | { ok: false; message: string } {
  try {
    return { ok: true, value: JSON.parse(value) };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "invalid JSON" };
  }
}

function nextCardId(board: Board): string {
  const count = board.lists.reduce((sum, list) => sum + list.cards.length, 0);
  return `c${count + 1}`;
}

function selectedLabel(selected: readonly string[]): string {
  return selected.length === 0 ? "none" : selected.join(", ");
}

export function InterfaceWorkbench() {
  const doc = useJSONDocument(BoardSchema, initialBoard, {
    history: 100,
    strict: false,
    selection: { mode: "extended", initial: [cardPointer(0, 0)] },
  });
  const selectedPointers = doc.selection?.selectedPointers ?? [];
  const primaryPointer = doc.selection?.primaryPointer ?? null;
  const [target, setTarget] = useState<Pointer>(cardPointer(0, 0));
  const [query, setQuery] = useState("$..cards[?(@.status=='todo')]");
  const [payload, setPayload] = useState(stringify(sampleCard));
  const [result, setResult] = useState<BenchResult>({ label: "ready", value: doc.value });

  const pointers = useMemo(
    () => doc.value.lists.flatMap((list, listIndex) =>
      list.cards.map((card, cardIndex) => ({
        pointer: cardPointer(listIndex, cardIndex),
        card,
      })),
    ),
    [doc.value],
  );

  const run = (label: string, action: () => unknown): void => {
    try {
      const value = action();
      setResult({ label, value: value ?? doc.value });
    } catch (error) {
      setResult({ label, value: error instanceof Error ? error.message : error });
    }
  };

  const parsedPayload = (): unknown => {
    const parsed = parseJson(payload);
    if (!parsed.ok) return { __invalid_json: parsed.message };
    return parsed.value;
  };

  const addCardToTodo = (): unknown => {
    const id = nextCardId(doc.value);
    return doc.ops.add("/lists/0/cards/-" as never, { ...sampleCard, id, title: `Card ${id}` } as never);
  };

  const replaceSelectedTitle = (): unknown => {
    const path = `${primaryPointer ?? cardPointer(0, 0)}/title` as Pointer;
    return doc.ops.replace(path as never, `Edited ${doc.history.undoDepth + 1}` as never);
  };

  const patchTwoFields = (): unknown => {
    const operations: JSONPatchOperation[] = [
      { op: "replace", path: "/settings/owner", value: "playground" },
      { op: "replace", path: "/lists/0/name", value: "Backlog" },
    ];
    return doc.ops.patch(operations, { label: "ops.patch" });
  };

  const invalidPatch = (): unknown => doc.ops.patch([
    { op: "replace", path: "/lists/0/cards/0/points", value: -10 },
  ]);

  const copySelection = (): unknown => doc.clipboard.copy(selectedPointers.length > 0 ? selectedPointers : undefined);

  const pasteClipboardAfterTarget = (): unknown => doc.clipboard.paste(target, "after");

  const commandPastePayload = (): unknown => doc.commands.paste(parsedPayload(), target, "after");

  const selectTodoCards = (): unknown => {
    const matches = doc.query("$..cards[?(@.status=='todo')]");
    if (!matches.ok) return matches;
    doc.selection?.selectRanges(matches.pointers, undefined, undefined, Math.max(0, matches.pointers.length - 1));
    return matches;
  };

  const selectTitleText = (): unknown => {
    doc.selection?.collapse({ path: "/title", offset: 0 });
    return doc.selection?.snapshot();
  };

  const replaceTitleText = (): unknown => {
    const selection = doc.selection?.snapshot();
    const hasTitleSelection = selection?.selectedPointers.includes("/title") ?? false;
    if (!hasTitleSelection) doc.selection?.collapse({ path: "/title", offset: 0 });
    return doc.commands.replaceText("Bench", { mergeKey: "title-text" });
  };

  const commitAddWithSelection = (): unknown => {
    const id = nextCardId(doc.value);
    const path = `/lists/1/cards/${doc.value.lists[1]?.cards.length ?? 0}` as Pointer;
    return doc.commit(
      [{ op: "add", path, value: { ...sampleCard, id, title: "Commit card", status: "doing" } }],
      { label: "commit", selection: { type: "collapse", point: path } },
    );
  };

  const transactionRename = (): unknown => {
    doc.history.transaction({ label: "rename-two" }, () => {
      doc.ops.replace("/lists/0/cards/0/title" as never, "Batch A" as never);
      doc.ops.replace("/lists/0/cards/1/title" as never, "Batch B" as never);
    });
    return doc.value;
  };

  const queryPointers = (): unknown => doc.query(query);

  const inspectPureExports = (): unknown => {
    const patch: JSONPatchOperation[] = [
      { op: "add", path: "/lists/0/cards/0/tags/-", value: "patched" },
      { op: "move", from: "/lists/0/cards/1", path: "/lists/1/cards/1" },
    ];
    const applied = applyPatch(BoardSchema, doc.value, patch);
    const appliedOne = applyOperation(BoardSchema, doc.value, {
      op: "replace",
      path: "/title",
      value: "Single op",
    });
    const headless = createJSONDocument(BoardSchema, initialBoard, {
      history: 10,
      selection: { mode: "extended", initial: [cardPointer(0, 0)] },
    });
    headless.commands.duplicate();
    const standaloneClipboard = createClipboard({
      schema: BoardSchema,
      getState: () => headless.value,
      ops: headless.ops,
      getSelectionSource: () => [cardPointer(0, 0), cardPointer(0, 1)],
      getSelectionTarget: () => "/lists/1/cards/-",
    });
    standaloneClipboard.copy();
    standaloneClipboard.paste();
    const fakeOps: JSONOps<Board> = {
      add: () => ({ ok: true }),
      remove: () => ({ ok: true }),
      replace: () => ({ ok: true }),
      move: () => ({ ok: true }),
      copy: () => ({ ok: true }),
      test: () => ({ ok: true }),
      patch: () => ({ ok: true }),
      load: () => ({ ok: true }),
      reset: () => ({ ok: true }),
      subscribe: () => () => undefined,
      get state() { return initialBoard; },
    };
    const standaloneSelection = createSelection(fakeOps, {
      mode: "extended",
      initial: [cardPointer(0, 0)],
    });
    standaloneSelection.togglePointer(cardPointer(0, 1));

    return {
      applyOperation: appliedOne.result,
      applyPatch: applied.result,
      headless: {
        title: headless.value.title,
        cards: headless.value.lists.map((list) => list.cards.length),
        selection: headless.selection?.selectedPointers,
        canUndo: headless.history.canUndo,
      },
      createSelection: standaloneSelection.snapshot(),
      createClipboard: standaloneClipboard.read(),
      pointer: {
        parse: parsePointer("/lists/0/cards/0"),
        build: buildPointer(["lists", 0, "cards", 0]),
        append: appendSegment("/lists/0/cards", 0),
        parent: parentPointer("/lists/0/cards/0/title"),
        escaped: escapeSegment("a/b~c"),
        unescaped: unescapeSegment("a~1b~0c"),
      },
      track: trackPointer("/lists/0/cards/1/title", patch),
    };
  };

  const findAndSelect = (): unknown => {
    const found = doc.commands.find(query);
    if (found.ok) {
      const pointers = found.matches.map((match) => match.pointer);
      doc.selection?.selectRanges(pointers, undefined, undefined, Math.max(0, pointers.length - 1));
    }
    return found;
  };

  const loadFixture = (): unknown => doc.ops.load({
    ...initialBoard,
    title: "Loaded fixture",
    settings: { archived: true, owner: "fixture" },
  });

  return (
    <div className="flex w-full flex-col gap-4">
      <section className="grid gap-4 lg:grid-cols-[minmax(20rem,1fr)_20rem]">
        <div className="rounded border border-stone-200 bg-white p-3">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <strong className="text-sm">Interface bench</strong>
            <Badge>selected: {selectedPointers.length}</Badge>
            <Badge>undo: {doc.history.undoDepth}</Badge>
            <Badge>redo: {doc.history.redoDepth}</Badge>
            <Badge>clipboard: {doc.clipboard.hasData ? "set" : "empty"}</Badge>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {doc.value.lists.map((list, listIndex) => (
              <div key={list.id} className="rounded border border-stone-200 p-2">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-400">{list.name}</div>
                <div className="flex flex-col gap-1">
                  {list.cards.map((card, cardIndex) => {
                    const pointer = cardPointer(listIndex, cardIndex);
                    const selected = selectedPointers.includes(pointer);
                    return (
                      <button
                        key={pointer}
                        aria-selected={selected}
                        onClick={(event) => {
                          setTarget(pointer);
                          if (event.shiftKey && primaryPointer) doc.selection?.setBaseAndExtent(primaryPointer, pointer);
                          else if (event.metaKey || event.ctrlKey) doc.selection?.togglePointer(pointer);
                          else doc.selection?.collapse(pointer);
                        }}
                        className="flex items-center justify-between gap-2 rounded px-2 py-2 text-left text-sm hover:bg-stone-100 aria-selected:bg-sky-100 aria-selected:text-sky-950"
                      >
                        <span className="min-w-0 truncate">{card.title}</span>
                        <span className="shrink-0 rounded bg-stone-100 px-1.5 py-0.5 text-[10px] uppercase text-stone-500">
                          {card.status}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        <aside className="rounded border border-stone-200 bg-white p-3">
          <Field label="target">
            <select
              value={target}
              onChange={(event) => setTarget(event.target.value as Pointer)}
              className="w-full rounded border border-stone-300 bg-white px-2 py-1 text-xs"
            >
              {pointers.map((item) => (
                <option key={item.pointer} value={item.pointer}>{item.pointer}</option>
              ))}
              <option value="/lists/0/cards/-">/lists/0/cards/-</option>
              <option value="/title">/title</option>
              <option value="/settings/archived">/settings/archived</option>
            </select>
          </Field>
          <Field label="jsonpath">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="w-full rounded border border-stone-300 px-2 py-1 font-mono text-xs"
            />
          </Field>
          <Field label="payload">
            <textarea
              value={payload}
              onChange={(event) => setPayload(event.target.value)}
              className="h-32 w-full resize-none rounded border border-stone-300 px-2 py-1 font-mono text-xs"
              spellCheck={false}
            />
          </Field>
        </aside>
      </section>

      <section className="grid gap-3 xl:grid-cols-4">
        <ActionGroup title="doc.ops">
          <ActionButton onClick={() => run("ops.add", addCardToTodo)}>add</ActionButton>
          <ActionButton onClick={() => run("ops.replace", replaceSelectedTitle)}>replace</ActionButton>
          <ActionButton onClick={() => run("ops.remove", () => doc.ops.remove(target as never))}>remove</ActionButton>
          <ActionButton onClick={() => run("ops.patch", patchTwoFields)}>patch</ActionButton>
          <ActionButton onClick={() => run("ops.patch invalid", invalidPatch)}>invalid</ActionButton>
          <ActionButton onClick={() => run("ops.load", loadFixture)}>load</ActionButton>
          <ActionButton onClick={() => run("ops.reset", () => doc.ops.reset())}>reset</ActionButton>
        </ActionGroup>

        <ActionGroup title="doc.commands">
          <ActionButton onClick={() => run("commands.duplicate", () => doc.commands.duplicate(target))}>duplicate</ActionButton>
          <ActionButton onClick={() => run("commands.move", () => doc.commands.move(target, "/lists/1/cards/0" as Pointer))}>move</ActionButton>
          <ActionButton onClick={() => run("commands.replace", () => doc.commands.replace(`${target}/title` as Pointer, "Command edit"))}>replace</ActionButton>
          <ActionButton onClick={() => run("commands.paste", commandPastePayload)}>paste</ActionButton>
          <ActionButton onClick={() => run("commands.remove", () => doc.commands.remove(selectedPointers.length > 0 ? selectedPointers : target))}>remove</ActionButton>
          <ActionButton onClick={() => run("commands.find", findAndSelect)}>find</ActionButton>
          <ActionButton onClick={() => run("commands.replaceText", replaceTitleText)}>replaceText</ActionButton>
        </ActionGroup>

        <ActionGroup title="doc.selection">
          <ActionButton onClick={() => run("selection.collapse", () => { doc.selection?.collapse(target); return doc.selection?.snapshot(); })}>collapse</ActionButton>
          <ActionButton onClick={() => run("selection.togglePointer", () => { doc.selection?.togglePointer(target); return doc.selection?.snapshot(); })}>toggle</ActionButton>
          <ActionButton onClick={() => run("selection.selectRanges", selectTodoCards)}>todo</ActionButton>
          <ActionButton onClick={() => run("selection.moveCursor", () => doc.selection?.moveCursor("next"))}>next</ActionButton>
          <ActionButton onClick={() => run("selection.extendCursor", () => doc.selection?.extendCursor("next"))}>extend</ActionButton>
          <ActionButton onClick={() => run("selection.selectScope", () => doc.selection?.selectScope({ scope: "/lists/0/cards" }))}>scope</ActionButton>
          <ActionButton onClick={() => run("selection.text", selectTitleText)}>text point</ActionButton>
          <ActionButton onClick={() => run("selection.empty", () => { doc.selection?.empty(); return doc.selection?.snapshot(); })}>empty</ActionButton>
        </ActionGroup>

        <ActionGroup title="doc.clipboard">
          <ActionButton onClick={() => run("clipboard.copy", copySelection)}>copy</ActionButton>
          <ActionButton onClick={() => run("clipboard.cut", () => doc.clipboard.cut(selectedPointers.length > 0 ? selectedPointers : target))}>cut</ActionButton>
          <ActionButton onClick={() => run("clipboard.paste", pasteClipboardAfterTarget)}>paste</ActionButton>
          <ActionButton onClick={() => run("clipboard.write", () => doc.clipboard.write(parsedPayload(), { source: target }))}>write</ActionButton>
          <ActionButton onClick={() => run("clipboard.read", () => doc.clipboard.read())}>read</ActionButton>
          <ActionButton onClick={() => run("clipboard.clear", () => { doc.clipboard.clear(); return doc.clipboard.read(); })}>clear</ActionButton>
        </ActionGroup>

        <ActionGroup title="history / commit">
          <ActionButton onClick={() => run("history.undo", () => doc.commands.undo())} disabled={!doc.history.canUndo}>undo</ActionButton>
          <ActionButton onClick={() => run("history.redo", () => doc.commands.redo())} disabled={!doc.history.canRedo}>redo</ActionButton>
          <ActionButton onClick={() => run("history.transaction", transactionRename)}>transaction</ActionButton>
          <ActionButton onClick={() => run("history.mergeLast", () => doc.history.mergeLast({ mergeKey: "manual" }))}>mergeLast</ActionButton>
          <ActionButton onClick={() => run("doc.commit", commitAddWithSelection)}>commit</ActionButton>
        </ActionGroup>

        <ActionGroup title="read / query">
          <ActionButton onClick={() => run("doc.at", () => doc.at(target))}>at</ActionButton>
          <ActionButton onClick={() => run("doc.exists", () => doc.exists(target))}>exists</ActionButton>
          <ActionButton onClick={() => run("doc.entries", () => doc.entries("/lists/0/cards" as Pointer))}>entries</ActionButton>
          <ActionButton onClick={() => run("doc.query", queryPointers)}>query</ActionButton>
        </ActionGroup>

        <ActionGroup title="check / can">
          <ActionButton onClick={() => run("check.replace", () => doc.check.replace(`${target}/points` as Pointer, 8))}>check ok</ActionButton>
          <ActionButton onClick={() => run("check.patch", () => doc.check.patch([{ op: "replace", path: `${target}/points`, value: -5 }]))}>check bad</ActionButton>
          <ActionButton onClick={() => run("can.copy", () => doc.can.copy(selectedPointers.length > 0 ? selectedPointers : target))}>can copy</ActionButton>
          <ActionButton onClick={() => run("can.paste", () => doc.can.paste(parsedPayload(), target, "after"))}>can paste</ActionButton>
          <ActionButton onClick={() => run("can.undo/redo", () => ({ undo: doc.can.undo, redo: doc.can.redo }))}>stacks</ActionButton>
        </ActionGroup>

        <ActionGroup title="doc.schema">
          <ActionButton onClick={() => run("schema.kind", () => doc.schema.kind(target))}>kind</ActionButton>
          <ActionButton onClick={() => run("schema.at", () => doc.schema.at(target))}>at</ActionButton>
          <ActionButton onClick={() => run("schema.describe", () => doc.schema.describe("/lists/0/cards/-" as Pointer, "insert"))}>describe</ActionButton>
          <ActionButton onClick={() => run("schema.accepts", () => doc.schema.accepts("/lists/0/cards/-" as Pointer, parsedPayload(), "insert"))}>accepts</ActionButton>
          <ActionButton onClick={() => run("schema.rejects", () => doc.schema.accepts("/lists/0/cards/-" as Pointer, invalidCard, "insert"))}>rejects</ActionButton>
        </ActionGroup>

        <ActionGroup title="pure exports">
          <ActionButton onClick={() => run("pure exports", inspectPureExports)}>inspect</ActionButton>
        </ActionGroup>
      </section>

      <ApiReference />

      <section className="grid gap-3 lg:grid-cols-3">
        <Inspect title="selection" value={{ selected: selectedLabel(selectedPointers), primary: primaryPointer, snapshot: doc.selection?.snapshot() }} />
        <Inspect title={result.label} value={result.value} />
        <Inspect title="state" value={{ value: doc.value, lastPatch: doc.lastPatch }} />
      </section>
    </div>
  );
}

function ApiReference() {
  return (
    <section className="rounded border border-stone-200 bg-white p-3">
      <h2 className="mb-3 mt-0 text-xs font-semibold uppercase tracking-wide text-stone-400">zod-crud API</h2>
      <div className="grid gap-3 lg:grid-cols-2">
        {API_REFERENCE.map((item) => (
          <div key={item.title} className="min-w-0">
            <h3 className="mb-1 mt-0 text-[11px] font-semibold text-stone-500">{item.title}</h3>
            <pre className="max-h-80 overflow-auto rounded bg-stone-950 p-3 text-[11px] leading-relaxed text-stone-100">
              <code>{item.code}</code>
            </pre>
          </div>
        ))}
      </div>
    </section>
  );
}

function Badge({ children }: { children: ReactNode }) {
  return <span className="rounded bg-stone-100 px-2 py-1 text-xs text-stone-600">{children}</span>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="mb-3 flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-stone-400">{label}</span>
      {children}
    </label>
  );
}

function ActionGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded border border-stone-200 bg-white p-3">
      <h2 className="mb-2 mt-0 text-xs font-semibold uppercase tracking-wide text-stone-400">{title}</h2>
      <div className="grid grid-cols-2 gap-1.5">{children}</div>
    </div>
  );
}

function ActionButton(props: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={props.onClick}
      disabled={props.disabled}
      className="rounded border border-stone-300 bg-white px-2 py-1 text-xs font-medium text-stone-700 hover:bg-stone-100 disabled:opacity-40"
    >
      {props.children}
    </button>
  );
}

function Inspect({ title, value }: { title: string; value: unknown }) {
  return (
    <div className="min-h-64 rounded border border-stone-200 bg-stone-950 p-3 text-stone-100">
      <h2 className="mb-2 mt-0 text-xs font-semibold uppercase tracking-wide text-stone-400">{title}</h2>
      <pre className="max-h-96 overflow-auto whitespace-pre-wrap text-xs leading-relaxed">{stringify(value)}</pre>
    </div>
  );
}

export default InterfaceWorkbench;
