import { useMemo, useState, type ReactNode } from "react";
import { z } from "zod";
import {
  appendSegment,
  applyOperation,
  applyPatch,
  buildPointer,
  createJSONDocument,
  escapeSegment,
  parentPointer,
  parsePointer,
  trackPointer,
  unescapeSegment,
  type JSONPatchOperation,
  type Pointer,
} from "zod-crud";
import { useJSONDocument } from "zod-crud/react";
import { MarkdownViewer } from "../components/MarkdownViewer";
import apiReferenceMarkdown from "../docs/zod-crud-api.md?raw";

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
type BenchResult = { call: string; value: unknown };

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

function cardRekey() {
  return { fields: ["id"], strategy: "suffix" as const };
}

export function InterfaceWorkbench() {
  const doc = useJSONDocument(BoardSchema, initialBoard, {
    history: 100,
    strict: false,
    selection: { mode: "extended", initial: [cardPointer(0, 0)] },
  });
  const selectedPointers = doc.selection?.selectedPointers ?? [];
  const primaryPointer = doc.selection?.primaryPointer ?? null;
  const [valueTarget, setValueTarget] = useState<Pointer>(cardPointer(0, 0));
  const [insertTarget, setInsertTarget] = useState<Pointer>("/lists/0/cards/-" as Pointer);
  const [query, setQuery] = useState("$..cards[?(@.status=='todo')]");
  const [payload, setPayload] = useState(stringify(sampleCard));
  const [result, setResult] = useState<BenchResult>({ call: "ready", value: doc.value });

  const pointers = useMemo(
    () => doc.value.lists.flatMap((list, listIndex) =>
      list.cards.map((card, cardIndex) => ({
        pointer: cardPointer(listIndex, cardIndex),
        card,
      })),
    ),
    [doc.value],
  );
  const insertPointers = useMemo(
    () => doc.value.lists.map((list, listIndex) => ({
      pointer: `/lists/${listIndex}/cards/-` as Pointer,
      label: `${list.name} /cards/-`,
    })),
    [doc.value],
  );
  const clipboardSnapshot = doc.clipboard.read();

  const run = (call: string, action: () => unknown): void => {
    try {
      const value = action();
      setResult({ call, value: value ?? doc.value });
    } catch (error) {
      setResult({ call, value: error instanceof Error ? error.message : error });
    }
  };

  const parsedPayload = (): unknown => {
    const parsed = parseJson(payload);
    if (!parsed.ok) return { __invalid_json: parsed.message };
    return parsed.value;
  };

  const addCardToTodo = (): unknown => {
    const id = nextCardId(doc.value);
    return doc.patch([
      { op: "add", path: "/lists/0/cards/-", value: { ...sampleCard, id, title: `Card ${id}` } },
    ]);
  };

  const replaceSelectedTitle = (): unknown => {
    const path = `${primaryPointer ?? cardPointer(0, 0)}/title` as Pointer;
    return doc.patch({ op: "replace", path, value: `Edited ${doc.history.undoDepth + 1}` });
  };

  const patchTwoFields = (): unknown => {
    const operations: JSONPatchOperation[] = [
      { op: "replace", path: "/settings/owner", value: "playground" },
      { op: "replace", path: "/lists/0/name", value: "Backlog" },
    ];
    return doc.patch(operations, { label: "doc.patch" });
  };

  const invalidPatch = (): unknown => doc.patch([
    { op: "replace", path: "/lists/0/cards/0/points", value: -10 },
  ]);

  const copySelection = (): unknown => doc.clipboard.copy(
    selectedPointers.length > 0 ? selectedPointers : valueTarget,
  );

  const pasteClipboardAfterTarget = (): unknown => doc.clipboard.paste({ after: valueTarget });

  const pasteClipboardToInsertTarget = (): unknown => doc.clipboard.paste(insertTarget, {
    spread: true,
    rekey: cardRekey(),
  });

  const pastePayloadAfterTarget = (): unknown => doc.clipboard.pastePayload(
    { after: valueTarget },
    parsedPayload(),
    { rekey: cardRekey() },
  );

  const pastePayloadToInsertTarget = (): unknown => doc.clipboard.pastePayload(
    insertTarget,
    parsedPayload(),
    { rekey: cardRekey() },
  );

  const copySelectionToInsertTarget = (): unknown => {
    const source = selectedPointers.length > 0 ? selectedPointers : valueTarget;
    const copied = doc.clipboard.copy(source);
    if (!copied.ok) return copied;
    return doc.clipboard.paste(insertTarget, {
      spread: Array.isArray(source),
      rekey: cardRekey(),
    });
  };

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
    const planned = doc.selection?.textPatch("Bench");
    return planned?.ok
      ? doc.commit(planned.patch, { mergeKey: "title-text", selection: planned.selection })
      : planned;
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
      doc.patch({ op: "replace", path: "/lists/0/cards/0/title", value: "Batch A" });
      doc.patch({ op: "replace", path: "/lists/0/cards/1/title", value: "Batch B" });
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
    headless.patch({ op: "copy", from: cardPointer(0, 0), path: "/lists/0/cards/-" });
    headless.selection?.togglePointer(cardPointer(0, 1));
    headless.clipboard.copy(headless.selection?.selectedPointers ?? []);
    headless.clipboard.paste("/lists/1/cards/-");

    return {
      applyOperation: appliedOne.result,
      applyPatch: applied.result,
      headless: {
        title: headless.value.title,
        cards: headless.value.lists.map((list) => list.cards.length),
        selection: headless.selection?.selectedPointers,
        canUndo: headless.history.canUndo,
      },
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
    const found = doc.query(query);
    if (found.ok) {
      doc.selection?.selectRanges(found.pointers, undefined, undefined, Math.max(0, found.pointers.length - 1));
    }
    return found;
  };

  const loadFixture = (): unknown => doc.load({
    ...initialBoard,
    title: "Loaded fixture",
    settings: { archived: true, owner: "fixture" },
  });
  const removeTargets = (): unknown => doc.patch(
    [...(selectedPointers.length > 0 ? selectedPointers : [valueTarget])]
      .reverse()
      .map((path) => ({ op: "remove", path }) satisfies JSONPatchOperation),
  );

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
                          setValueTarget(pointer);
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
          <Field label="value target">
            <select
              value={valueTarget}
              onChange={(event) => setValueTarget(event.target.value as Pointer)}
              className="w-full rounded border border-stone-300 bg-white px-2 py-1 text-xs"
            >
              {pointers.map((item) => (
                <option key={item.pointer} value={item.pointer}>{item.pointer}</option>
              ))}
              <option value="/title">/title</option>
              <option value="/settings/archived">/settings/archived</option>
            </select>
          </Field>
          <Field label="insert target">
            <select
              value={insertTarget}
              onChange={(event) => setInsertTarget(event.target.value as Pointer)}
              className="w-full rounded border border-stone-300 bg-white px-2 py-1 text-xs"
            >
              {insertPointers.map((item) => (
                <option key={item.pointer} value={item.pointer}>{item.label}</option>
              ))}
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
        <ActionGroup title="doc.patch">
          <ActionButton onClick={() => run('doc.patch([{ op: "add", path: "/lists/0/cards/-", value: card }])', addCardToTodo)}>add</ActionButton>
          <ActionButton onClick={() => run(`doc.patch([{ op: "replace", path: "${valueTarget}/title", value: "Patch edit" }])`, () => doc.patch([{ op: "replace", path: `${valueTarget}/title`, value: "Patch edit" }]))}>replace</ActionButton>
          <ActionButton onClick={() => run(`doc.patch([{ op: "remove", path: "${valueTarget}" }])`, () => doc.patch([{ op: "remove", path: valueTarget }]))}>remove</ActionButton>
          <ActionButton onClick={() => run("doc.patch([...operations], { label: \"doc.patch\" })", patchTwoFields)}>batch</ActionButton>
          <ActionButton onClick={() => run('doc.patch([{ op: "replace", path: "/lists/0/cards/0/points", value: -10 }])', invalidPatch)}>invalid</ActionButton>
          <ActionButton onClick={() => run("doc.load(nextValue)", loadFixture)}>load</ActionButton>
          <ActionButton onClick={() => run("doc.reset()", () => doc.reset())}>reset</ActionButton>
        </ActionGroup>

        <ActionGroup title="document actions">
          <ActionButton onClick={() => run(`doc.duplicate("${valueTarget}", { rekey })`, () => doc.duplicate(valueTarget, { rekey: cardRekey() }))}>duplicate</ActionButton>
          <ActionButton onClick={() => run(`doc.patch({ op: "move", from: "${valueTarget}", path: "${insertTarget}" })`, () => doc.patch({ op: "move", from: valueTarget, path: insertTarget }))}>move</ActionButton>
          <ActionButton onClick={() => run(`doc.patch({ op: "replace", path: "${primaryPointer ?? cardPointer(0, 0)}/title", value })`, replaceSelectedTitle)}>replace</ActionButton>
          <ActionButton onClick={() => run(`doc.clipboard.pastePayload({ after: "${valueTarget}" }, payload, { rekey })`, pastePayloadAfterTarget)}>paste payload after</ActionButton>
          <ActionButton onClick={() => run("doc.patch(selectedPointers.map((path) => ({ op: \"remove\", path })))", removeTargets)}>remove</ActionButton>
          <ActionButton onClick={() => run("doc.query(jsonPath); doc.selection?.selectRanges(pointers)", findAndSelect)}>select query</ActionButton>
          <ActionButton onClick={() => run('doc.selection?.textPatch("Bench")', replaceTitleText)}>replaceText</ActionButton>
        </ActionGroup>

        <ActionGroup title="doc.selection">
          <ActionButton onClick={() => run(`doc.selection?.collapse("${valueTarget}")`, () => { doc.selection?.collapse(valueTarget); return doc.selection?.snapshot(); })}>collapse</ActionButton>
          <ActionButton onClick={() => run(`doc.selection?.togglePointer("${valueTarget}")`, () => { doc.selection?.togglePointer(valueTarget); return doc.selection?.snapshot(); })}>toggle target</ActionButton>
          <ActionButton onClick={() => run("doc.selection?.selectRanges(todoPointers)", selectTodoCards)}>select todo</ActionButton>
          <ActionButton onClick={() => run('doc.selection?.moveCursor("next")', () => doc.selection?.moveCursor("next"))}>next</ActionButton>
          <ActionButton onClick={() => run('doc.selection?.extendCursor("next")', () => doc.selection?.extendCursor("next"))}>extend</ActionButton>
          <ActionButton onClick={() => run('doc.selection?.selectScope({ scope: "/lists/0/cards" })', () => doc.selection?.selectScope({ scope: "/lists/0/cards" }))}>scope</ActionButton>
          <ActionButton onClick={() => run('doc.selection?.collapse({ path: "/title", offset: 0 })', selectTitleText)}>text point</ActionButton>
          <ActionButton onClick={() => run("doc.selection?.empty()", () => { doc.selection?.empty(); return doc.selection?.snapshot(); })}>empty</ActionButton>
        </ActionGroup>

        <ActionGroup title="doc.clipboard">
          <ActionButton onClick={() => run("doc.clipboard.copy(source)", copySelection)}>copy</ActionButton>
          <ActionButton onClick={() => run("doc.clipboard.cut(source)", () => doc.clipboard.cut(selectedPointers.length > 0 ? selectedPointers : valueTarget))}>cut</ActionButton>
          <ActionButton onClick={() => run(`doc.clipboard.paste({ after: "${valueTarget}" })`, pasteClipboardAfterTarget)}>paste after</ActionButton>
          <ActionButton onClick={() => run(`doc.clipboard.paste("${insertTarget}", { spread: true, rekey })`, pasteClipboardToInsertTarget)}>paste insert</ActionButton>
          <ActionButton onClick={() => run(`doc.clipboard.pastePayload("${insertTarget}", payload, { rekey })`, pastePayloadToInsertTarget)}>payload insert</ActionButton>
          <ActionButton onClick={() => run(`doc.clipboard.copy(source); doc.clipboard.paste("${insertTarget}", { spread: true, rekey })`, copySelectionToInsertTarget)}>copy to insert</ActionButton>
          <ActionButton onClick={() => run(`doc.clipboard.write(payload, { source: "${valueTarget}" })`, () => doc.clipboard.write(parsedPayload(), { source: valueTarget }))}>write</ActionButton>
          <ActionButton onClick={() => run("doc.clipboard.read()", () => doc.clipboard.read())}>read</ActionButton>
          <ActionButton onClick={() => run("doc.clipboard.clear()", () => { doc.clipboard.clear(); return doc.clipboard.read(); })}>clear</ActionButton>
        </ActionGroup>

        <ActionGroup title="doc.history">
          <ActionButton onClick={() => run("doc.history.undo()", () => doc.history.undo())} disabled={!doc.history.canUndo}>undo</ActionButton>
          <ActionButton onClick={() => run("doc.history.redo()", () => doc.history.redo())} disabled={!doc.history.canRedo}>redo</ActionButton>
          <ActionButton onClick={() => run("doc.history.transaction(options, fn)", transactionRename)}>transaction</ActionButton>
          <ActionButton onClick={() => run('doc.history.mergeLast({ mergeKey: "manual" })', () => doc.history.mergeLast({ mergeKey: "manual" }))}>mergeLast</ActionButton>
          <ActionButton onClick={() => run("doc.commit(patch, { selection })", commitAddWithSelection)}>commit</ActionButton>
        </ActionGroup>

        <ActionGroup title="doc.query">
          <ActionButton onClick={() => run(`doc.at("${valueTarget}")`, () => doc.at(valueTarget))}>at</ActionButton>
          <ActionButton onClick={() => run(`doc.exists("${valueTarget}")`, () => doc.exists(valueTarget))}>exists</ActionButton>
          <ActionButton onClick={() => run('doc.entries("/lists/0/cards")', () => doc.entries("/lists/0/cards" as Pointer))}>entries</ActionButton>
          <ActionButton onClick={() => run(`doc.query(${JSON.stringify(query)})`, queryPointers)}>query</ActionButton>
        </ActionGroup>

        <ActionGroup title="doc.can*">
          <ActionButton onClick={() => run('doc.canPatch([{ op: "replace", path: "/title", value: "Ready" }])', () => doc.canPatch([{ op: "replace", path: "/title", value: "Ready" }]))}>patch</ActionButton>
          <ActionButton onClick={() => run(`doc.canFind(${JSON.stringify(query)})`, () => doc.canFind(query))}>find</ActionButton>
          <ActionButton onClick={() => run(`doc.canReplace("${valueTarget}/points", 8)`, () => doc.canReplace(`${valueTarget}/points` as Pointer, 8))}>replace ok</ActionButton>
          <ActionButton onClick={() => run(`doc.canReplace("${valueTarget}/points", -5)`, () => doc.canReplace(`${valueTarget}/points` as Pointer, -5))}>replace bad</ActionButton>
          <ActionButton onClick={() => run(`doc.canRemove("${valueTarget}")`, () => doc.canRemove(valueTarget))}>remove</ActionButton>
          <ActionButton onClick={() => run(`doc.canMove("${valueTarget}", "${insertTarget}")`, () => doc.canMove(valueTarget, insertTarget))}>move</ActionButton>
          <ActionButton onClick={() => run(`doc.canDuplicate("${valueTarget}", { rekey })`, () => doc.canDuplicate(valueTarget, { rekey: cardRekey() }))}>duplicate</ActionButton>
          <ActionButton onClick={() => run("doc.canCopy(source)", () => doc.canCopy(selectedPointers.length > 0 ? selectedPointers : valueTarget))}>copy</ActionButton>
          <ActionButton onClick={() => run("doc.canCut(source)", () => doc.canCut(selectedPointers.length > 0 ? selectedPointers : valueTarget))}>cut</ActionButton>
          <ActionButton onClick={() => run(`doc.canPaste("${insertTarget}", { spread: true, rekey })`, () => doc.canPaste(insertTarget, { spread: true, rekey: cardRekey() }))}>paste buffer</ActionButton>
          <ActionButton onClick={() => run(`doc.canPastePayload({ after: "${valueTarget}" }, payload)`, () => doc.canPastePayload({ after: valueTarget }, parsedPayload()))}>paste after</ActionButton>
          <ActionButton onClick={() => run(`doc.canPastePayload("${insertTarget}", payload)`, () => doc.canPastePayload(insertTarget, parsedPayload()))}>paste insert</ActionButton>
          <ActionButton onClick={() => run("({ undo: doc.canUndo(), redo: doc.canRedo() })", () => ({ undo: doc.canUndo(), redo: doc.canRedo() }))}>stacks</ActionButton>
        </ActionGroup>

        <ActionGroup title="doc.schema">
          <ActionButton onClick={() => run(`doc.schema.kind("${valueTarget}")`, () => doc.schema.kind(valueTarget))}>kind</ActionButton>
          <ActionButton onClick={() => run(`doc.schema.at("${valueTarget}")`, () => doc.schema.at(valueTarget))}>at</ActionButton>
          <ActionButton onClick={() => run(`doc.schema.describe("${insertTarget}", "insert")`, () => doc.schema.describe(insertTarget, "insert"))}>describe insert</ActionButton>
          <ActionButton onClick={() => run(`doc.schema.accepts("${insertTarget}", payload, "insert")`, () => doc.schema.accepts(insertTarget, parsedPayload(), "insert"))}>accepts</ActionButton>
          <ActionButton onClick={() => run(`doc.schema.accepts("${insertTarget}", invalidCard, "insert")`, () => doc.schema.accepts(insertTarget, invalidCard, "insert"))}>rejects</ActionButton>
        </ActionGroup>

        <ActionGroup title="pure exports">
          <ActionButton onClick={() => run("applyPatch(schema, state, patch)", inspectPureExports)}>inspect</ActionButton>
        </ActionGroup>
      </section>

      <ApiReference />

      <section className="grid gap-3 lg:grid-cols-3">
        <Inspect title="selection" value={{ selected: selectedLabel(selectedPointers), primary: primaryPointer, snapshot: doc.selection?.snapshot() }} />
        <Inspect title="clipboard buffer" value={clipboardSnapshot} />
        <Inspect title="result" value={result} />
        <Inspect title="state" value={{ valueTarget, insertTarget, value: doc.value, lastPatch: doc.lastPatch }} />
      </section>
    </div>
  );
}

function ApiReference() {
  return (
    <section className="rounded border border-stone-200 bg-white p-3">
      <MarkdownViewer source={apiReferenceMarkdown} />
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
      <pre className="overflow-auto whitespace-pre-wrap text-xs leading-relaxed">{stringify(value)}</pre>
    </div>
  );
}

export default InterfaceWorkbench;
