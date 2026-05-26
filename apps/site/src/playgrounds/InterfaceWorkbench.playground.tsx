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
  type JSONCapabilityResult,
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
    {
      id: "done",
      name: "Done",
      cards: [
        { id: "c4", title: "History API", status: "done", points: 8, tags: ["history"] },
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

function parseNumberPayload(value: string): unknown {
  const trimmed = value.trim();
  if (trimmed.length === 0) return { __invalid_number: "empty" };
  const number = Number(trimmed);
  return Number.isFinite(number) ? number : { __invalid_number: value };
}

function canDisabledReason(result: JSONCapabilityResult): string | undefined {
  if (result.ok) return undefined;
  const violation = result.violations?.[0];
  const detail = result.reason
    ?? (violation ? `${violation.path}: ${violation.message}` : undefined)
    ?? result.pointer;
  return detail ? `can: ${result.code}: ${detail}` : `can: ${result.code}`;
}

function selectedLabel(selected: readonly string[]): string {
  return selected.length === 0 ? "none" : selected.join(", ");
}

function cardRekey() {
  return { fields: ["id"], strategy: "suffix" as const };
}

function columnClass(id: string): string {
  if (id === "doing") return "border-amber-200 bg-amber-50/70";
  if (id === "done") return "border-emerald-200 bg-emerald-50/70";
  return "border-stone-200 bg-stone-50";
}

function statusClass(status: Board["lists"][number]["cards"][number]["status"]): string {
  if (status === "doing") return "bg-amber-100 text-amber-800";
  if (status === "done") return "bg-emerald-100 text-emerald-800";
  return "bg-sky-100 text-sky-800";
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
  const [textPayload, setTextPayload] = useState("Patch edit");
  const [pointsPayload, setPointsPayload] = useState("8");
  const [badPointsPayload, setBadPointsPayload] = useState("-5");
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
  const hasClipboard = doc.clipboard.hasData;
  const payloadValue = useMemo(() => {
    const parsed = parseJson(payload);
    if (!parsed.ok) return { __invalid_json: parsed.message };
    return parsed.value;
  }, [payload]);
  const pointsValue = useMemo(() => parseNumberPayload(pointsPayload), [pointsPayload]);
  const badPointsValue = useMemo(() => parseNumberPayload(badPointsPayload), [badPointsPayload]);
  const selectedSource = selectedPointers.length > 0 ? selectedPointers : valueTarget;
  const targetTitlePath = `${valueTarget}/title` as Pointer;
  const targetPointsPath = `${valueTarget}/points` as Pointer;
  const primaryTitlePath = `${primaryPointer ?? cardPointer(0, 0)}/title` as Pointer;
  const commitInsertPath = `/lists/1/cards/${doc.value.lists[1]?.cards.length ?? 0}` as Pointer;
  const canAddPayload = doc.canPatch([{ op: "add", path: "/lists/0/cards/-", value: payloadValue }]);
  const canPatchReplaceTitle = doc.canPatch([{ op: "replace", path: targetTitlePath, value: textPayload }]);
  const canPatchRemoveTarget = doc.canPatch([{ op: "remove", path: valueTarget }]);
  const canDuplicateTarget = doc.canDuplicate(valueTarget, { rekey: cardRekey() });
  const canMoveTarget = doc.canMove(valueTarget, insertTarget);
  const canReplacePrimaryTitle = doc.canReplace(primaryTitlePath, textPayload);
  const canPastePayloadAfterTarget = doc.canPastePayload({ after: valueTarget }, payloadValue, { rekey: cardRekey() });
  const canRemoveSource = doc.canRemove(selectedSource);
  const canCopySource = doc.canCopy(selectedSource);
  const canCutSource = doc.canCut(selectedSource);
  const canPasteClipboardAfterTarget = doc.canPaste({ after: valueTarget });
  const canPasteClipboardToInsertTarget = doc.canPaste(insertTarget, { spread: true, rekey: cardRekey() });
  const canPastePayloadToInsertTarget = doc.canPastePayload(insertTarget, payloadValue, { rekey: cardRekey() });
  const canCommitPayload = doc.canPatch([{ op: "add", path: commitInsertPath, value: payloadValue }]);
  const clipboardEmptyReason = hasClipboard ? undefined : "state: empty_clipboard";

  const run = (call: string, action: () => unknown): void => {
    try {
      const value = action();
      setResult({ call, value: value ?? doc.value });
    } catch (error) {
      setResult({ call, value: error instanceof Error ? error.message : error });
    }
  };

  const parsedPayload = (): unknown => {
    return payloadValue;
  };

  const addCardToTodo = (): unknown => {
    return doc.patch([
      { op: "add", path: "/lists/0/cards/-", value: parsedPayload() },
    ]);
  };

  const replaceSelectedTitle = (): unknown => {
    const path = `${primaryPointer ?? cardPointer(0, 0)}/title` as Pointer;
    return doc.patch({ op: "replace", path, value: textPayload });
  };

  const patchTwoFields = (): unknown => {
    const operations: JSONPatchOperation[] = [
      { op: "replace", path: "/settings/owner", value: "playground" },
      { op: "replace", path: "/lists/0/name", value: "Backlog" },
    ];
    return doc.patch(operations, { label: "doc.patch" });
  };

  const invalidPatch = (): unknown => doc.patch([
    { op: "replace", path: "/lists/0/cards/0/points", value: badPointsValue },
  ]);

  const copySelection = (): unknown => doc.clipboard.copy(selectedSource);

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

  const duplicateTarget = (): unknown => {
    const duplicated = doc.duplicate(valueTarget, { rekey: cardRekey() });
    if (duplicated.ok) {
      setValueTarget(duplicated.duplicatedTo);
      doc.selection?.collapse(duplicated.duplicatedTo);
    }
    return duplicated;
  };

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
    const planned = doc.selection?.textPatch(textPayload);
    return planned?.ok
      ? doc.commit(planned.patch, { mergeKey: "title-text", selection: planned.selection })
      : planned;
  };

  const commitAddWithSelection = (): unknown => {
    return doc.commit(
      [{ op: "add", path: commitInsertPath, value: parsedPayload() }],
      { label: "commit", selection: { type: "collapse", point: commitInsertPath } },
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
      <section className="grid gap-4 xl:grid-cols-[minmax(38rem,1fr)_22rem]">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <strong className="text-sm text-stone-950">Interface bench</strong>
            <Badge>selected {selectedPointers.length}</Badge>
            <Badge>undo {doc.history.undoDepth}</Badge>
            <Badge>redo {doc.history.redoDepth}</Badge>
            <Badge>clipboard {doc.clipboard.hasData ? "set" : "empty"}</Badge>
          </div>
          <div className="grid gap-3 lg:grid-cols-3">
            {doc.value.lists.map((list, listIndex) => (
              <div key={list.id} className={`flex min-h-80 flex-col rounded border p-2 ${columnClass(list.id)}`}>
                <div className="mb-2 flex items-center justify-between gap-2 px-1">
                  <h2 className="m-0 text-xs font-semibold uppercase tracking-wide text-stone-500">{list.name}</h2>
                  <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-medium text-stone-500">{list.cards.length}</span>
                </div>
                <div className="flex flex-1 flex-col gap-2">
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
                        className="flex min-h-24 flex-col items-stretch justify-between gap-3 rounded-md border border-stone-200 bg-white p-3 text-left text-sm shadow-sm hover:border-stone-300 hover:bg-stone-50 aria-selected:border-sky-500 aria-selected:bg-sky-50 aria-selected:ring-2 aria-selected:ring-sky-200"
                      >
                        <span className="min-w-0 text-sm font-medium text-stone-950">{card.title}</span>
                        <span className="flex items-center justify-between gap-2">
                          <span className="min-w-0 truncate text-[11px] text-stone-500">{pointer}</span>
                          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase ${statusClass(card.status)}`}>
                            {card.status}
                          </span>
                        </span>
                        <span className="flex flex-wrap items-center gap-1">
                          <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-600">{card.points}pt</span>
                          {card.tags.map((tag) => (
                            <span key={tag} className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-500">{tag}</span>
                          ))}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        <aside className="self-start rounded border border-stone-200 bg-white p-3 xl:sticky xl:top-3">
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
          <Field label="text payload">
            <input
              value={textPayload}
              onChange={(event) => setTextPayload(event.target.value)}
              className="w-full rounded border border-stone-300 px-2 py-1 text-xs"
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="points">
              <input
                type="number"
                value={pointsPayload}
                onChange={(event) => setPointsPayload(event.target.value)}
                className="w-full rounded border border-stone-300 px-2 py-1 text-xs"
              />
            </Field>
            <Field label="bad points">
              <input
                type="number"
                value={badPointsPayload}
                onChange={(event) => setBadPointsPayload(event.target.value)}
                className="w-full rounded border border-stone-300 px-2 py-1 text-xs"
              />
            </Field>
          </div>
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

      <section className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
        <ActionGroup title="doc.patch">
          <ActionButton disabledReason={canDisabledReason(canAddPayload)} onClick={() => run('doc.patch([{ op: "add", path: "/lists/0/cards/-", value: payload }])', addCardToTodo)}>add</ActionButton>
          <ActionButton disabledReason={canDisabledReason(canPatchReplaceTitle)} onClick={() => run(`doc.patch([{ op: "replace", path: "${targetTitlePath}", value: textPayload }])`, () => doc.patch([{ op: "replace", path: targetTitlePath, value: textPayload }]))}>replace</ActionButton>
          <ActionButton disabledReason={canDisabledReason(canPatchRemoveTarget)} onClick={() => run(`doc.patch([{ op: "remove", path: "${valueTarget}" }])`, () => doc.patch([{ op: "remove", path: valueTarget }]))}>remove</ActionButton>
          <ActionButton onClick={() => run("doc.patch([...operations], { label: \"doc.patch\" })", patchTwoFields)}>batch</ActionButton>
          <ActionButton onClick={() => run('doc.patch([{ op: "replace", path: "/lists/0/cards/0/points", value: badPoints }])', invalidPatch)}>invalid</ActionButton>
          <ActionButton onClick={() => run("doc.load(nextValue)", loadFixture)}>load</ActionButton>
          <ActionButton onClick={() => run("doc.reset()", () => doc.reset())}>reset</ActionButton>
        </ActionGroup>

        <ActionGroup title="document actions">
          <ActionButton disabledReason={canDisabledReason(canDuplicateTarget)} onClick={() => run(`doc.duplicate("${valueTarget}", { rekey })`, duplicateTarget)}>duplicate</ActionButton>
          <ActionButton disabledReason={canDisabledReason(canMoveTarget)} onClick={() => run(`doc.patch({ op: "move", from: "${valueTarget}", path: "${insertTarget}" })`, () => doc.patch({ op: "move", from: valueTarget, path: insertTarget }))}>move</ActionButton>
          <ActionButton disabledReason={canDisabledReason(canReplacePrimaryTitle)} onClick={() => run(`doc.patch({ op: "replace", path: "${primaryTitlePath}", value: textPayload })`, replaceSelectedTitle)}>replace</ActionButton>
          <ActionButton disabledReason={canDisabledReason(canPastePayloadAfterTarget)} onClick={() => run(`doc.clipboard.pastePayload({ after: "${valueTarget}" }, payload, { rekey })`, pastePayloadAfterTarget)}>paste payload after</ActionButton>
          <ActionButton disabledReason={canDisabledReason(canRemoveSource)} onClick={() => run("doc.patch(selectedPointers.map((path) => ({ op: \"remove\", path })))", removeTargets)}>remove</ActionButton>
          <ActionButton onClick={() => run("doc.query(jsonPath); doc.selection?.selectRanges(pointers)", findAndSelect)}>select query</ActionButton>
          <ActionButton onClick={() => run("doc.selection?.textPatch(textPayload)", replaceTitleText)}>replaceText</ActionButton>
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
          <ActionButton disabledReason={canDisabledReason(canCopySource)} onClick={() => run("doc.clipboard.copy(source)", copySelection)}>copy</ActionButton>
          <ActionButton disabledReason={canDisabledReason(canCutSource)} onClick={() => run("doc.clipboard.cut(source)", () => doc.clipboard.cut(selectedSource))}>cut</ActionButton>
          <ActionButton disabledReason={canDisabledReason(canPasteClipboardAfterTarget)} onClick={() => run(`doc.clipboard.paste({ after: "${valueTarget}" })`, pasteClipboardAfterTarget)}>paste after</ActionButton>
          <ActionButton disabledReason={canDisabledReason(canPasteClipboardToInsertTarget)} onClick={() => run(`doc.clipboard.paste("${insertTarget}", { spread: true, rekey })`, pasteClipboardToInsertTarget)}>paste insert</ActionButton>
          <ActionButton disabledReason={canDisabledReason(canPastePayloadToInsertTarget)} onClick={() => run(`doc.clipboard.pastePayload("${insertTarget}", payload, { rekey })`, pastePayloadToInsertTarget)}>payload insert</ActionButton>
          <ActionButton onClick={() => run(`doc.clipboard.copy(source); doc.clipboard.paste("${insertTarget}", { spread: true, rekey })`, copySelectionToInsertTarget)}>copy to insert</ActionButton>
          <ActionButton onClick={() => run(`doc.clipboard.write(payload, { source: "${valueTarget}" })`, () => doc.clipboard.write(parsedPayload(), { source: valueTarget }))}>write</ActionButton>
          <ActionButton disabledReason={clipboardEmptyReason} disabledMark="state" onClick={() => run("doc.clipboard.read()", () => doc.clipboard.read())}>read</ActionButton>
          <ActionButton disabledReason={clipboardEmptyReason} disabledMark="state" onClick={() => run("doc.clipboard.clear()", () => { doc.clipboard.clear(); return doc.clipboard.read(); })}>clear</ActionButton>
        </ActionGroup>

        <ActionGroup title="doc.history">
          <ActionButton onClick={() => run("doc.history.undo()", () => doc.history.undo())} disabledReason={canDisabledReason(doc.canUndo())}>undo</ActionButton>
          <ActionButton onClick={() => run("doc.history.redo()", () => doc.history.redo())} disabledReason={canDisabledReason(doc.canRedo())}>redo</ActionButton>
          <ActionButton onClick={() => run("doc.history.transaction(options, fn)", transactionRename)}>transaction</ActionButton>
          <ActionButton disabledReason={canDisabledReason(doc.canUndo())} onClick={() => run('doc.history.mergeLast({ mergeKey: "manual" })', () => doc.history.mergeLast({ mergeKey: "manual" }))}>mergeLast</ActionButton>
          <ActionButton disabledReason={canDisabledReason(canCommitPayload)} onClick={() => run("doc.commit(patch, { selection })", commitAddWithSelection)}>commit</ActionButton>
        </ActionGroup>

        <ActionGroup title="doc.query">
          <ActionButton onClick={() => run(`doc.at("${valueTarget}")`, () => doc.at(valueTarget))}>at</ActionButton>
          <ActionButton onClick={() => run(`doc.exists("${valueTarget}")`, () => doc.exists(valueTarget))}>exists</ActionButton>
          <ActionButton onClick={() => run('doc.entries("/lists/0/cards")', () => doc.entries("/lists/0/cards" as Pointer))}>entries</ActionButton>
          <ActionButton onClick={() => run(`doc.query(${JSON.stringify(query)})`, queryPointers)}>query</ActionButton>
        </ActionGroup>

        <ActionGroup title="doc.can*">
          <ActionButton onClick={() => run("doc.canPatch([{ op: \"replace\", path: \"/title\", value: textPayload }])", () => doc.canPatch([{ op: "replace", path: "/title", value: textPayload }]))}>patch</ActionButton>
          <ActionButton onClick={() => run(`doc.canFind(${JSON.stringify(query)})`, () => doc.canFind(query))}>find</ActionButton>
          <ActionButton onClick={() => run(`doc.canReplace("${targetPointsPath}", pointsPayload)`, () => doc.canReplace(targetPointsPath, pointsValue))}>replace ok</ActionButton>
          <ActionButton onClick={() => run(`doc.canReplace("${targetPointsPath}", badPoints)`, () => doc.canReplace(targetPointsPath, badPointsValue))}>replace bad</ActionButton>
          <ActionButton onClick={() => run(`doc.canRemove("${valueTarget}")`, () => doc.canRemove(valueTarget))}>remove</ActionButton>
          <ActionButton onClick={() => run(`doc.canMove("${valueTarget}", "${insertTarget}")`, () => doc.canMove(valueTarget, insertTarget))}>move</ActionButton>
          <ActionButton onClick={() => run(`doc.canDuplicate("${valueTarget}", { rekey })`, () => doc.canDuplicate(valueTarget, { rekey: cardRekey() }))}>duplicate</ActionButton>
          <ActionButton onClick={() => run("doc.canCopy(source)", () => doc.canCopy(selectedSource))}>copy</ActionButton>
          <ActionButton onClick={() => run("doc.canCut(source)", () => doc.canCut(selectedSource))}>cut</ActionButton>
          <ActionButton onClick={() => run(`doc.canPaste("${insertTarget}", { spread: true, rekey })`, () => doc.canPaste(insertTarget, { spread: true, rekey: cardRekey() }))}>paste buffer</ActionButton>
          <ActionButton onClick={() => run(`doc.canPastePayload({ after: "${valueTarget}" }, payload)`, () => doc.canPastePayload({ after: valueTarget }, parsedPayload(), { rekey: cardRekey() }))}>paste after</ActionButton>
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

      <section className="grid gap-3 lg:grid-cols-3">
        <Inspect title="selection" value={{ selected: selectedLabel(selectedPointers), primary: primaryPointer, snapshot: doc.selection?.snapshot() }} />
        <Inspect title="clipboard buffer" value={clipboardSnapshot} />
        <Inspect title="result" value={result} />
        <Inspect title="state" value={{ valueTarget, insertTarget, value: doc.value, lastPatch: doc.lastPatch }} />
      </section>
    </div>
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
      <div className="grid grid-cols-[repeat(auto-fit,minmax(7rem,1fr))] gap-2">{children}</div>
    </div>
  );
}

function ActionButton(props: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  disabledReason?: string;
  disabledMark?: string;
}) {
  const disabled = props.disabled === true || props.disabledReason !== undefined;
  const label = typeof props.children === "string" ? props.children : undefined;
  return (
    <button
      onClick={props.onClick}
      disabled={disabled}
      aria-label={label}
      title={props.disabledReason}
      className="inline-flex min-h-9 items-center justify-center gap-1 whitespace-normal rounded border border-stone-300 bg-white px-3 py-2 text-center text-xs font-medium leading-tight text-stone-700 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {props.children}
      {props.disabledReason ? (
        <span aria-hidden="true" className="rounded bg-stone-100 px-1 text-[10px] uppercase text-stone-500">
          {props.disabledMark ?? "can"}
        </span>
      ) : null}
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
