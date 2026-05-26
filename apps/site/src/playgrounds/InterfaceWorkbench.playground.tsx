import { useMemo, useState, type ReactNode } from "react";
import { z } from "zod";
import {
  appendSegment,
  applyOperation,
  applyPatch,
  applyPatchToTrustedState,
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

  const inspectCreateJSONDocument = (): unknown => {
    const headless = createJSONDocument(BoardSchema, initialBoard, {
      history: 10,
      selection: { mode: "extended", initial: [cardPointer(0, 0)] },
    });
    headless.patch({ op: "copy", from: cardPointer(0, 0), path: "/lists/0/cards/-" });
    headless.selection?.togglePointer(cardPointer(0, 1));
    headless.clipboard.copy(headless.selection?.selectedPointers ?? []);
    headless.clipboard.paste("/lists/1/cards/-");

    return {
      title: headless.value.title,
      cards: headless.value.lists.map((list) => list.cards.length),
      selection: headless.selection?.selectedPointers,
      canUndo: headless.history.canUndo,
    };
  };

  const inspectApplyOperation = (): unknown => applyOperation(BoardSchema, doc.value, {
    op: "replace",
    path: "/title",
    value: "Single op",
  });

  const inspectApplyPatch = (): unknown => {
    const patch: JSONPatchOperation[] = [
      { op: "add", path: "/lists/0/cards/0/tags/-", value: "patched" },
      { op: "move", from: "/lists/0/cards/1", path: "/lists/1/cards/1" },
    ];
    return applyPatch(BoardSchema, doc.value, patch);
  };

  const inspectApplyPatchToTrustedState = (): unknown => applyPatchToTrustedState(BoardSchema, doc.value, [
    { op: "replace", path: "/settings/owner", value: "trusted" },
  ]);

  const inspectPointerHelpers = (): unknown => {
    return {
      parsePointer: parsePointer("/lists/0/cards/0"),
      buildPointer: buildPointer(["lists", 0, "cards", 0]),
      appendSegment: appendSegment("/lists/0/cards", 0),
      parentPointer: parentPointer("/lists/0/cards/0/title"),
      escapeSegment: escapeSegment("a/b~c"),
      unescapeSegment: unescapeSegment("a~1b~0c"),
    };
  };

  const inspectTrackPointer = (): unknown => trackPointer("/lists/0/cards/1/title", [
    { op: "add", path: "/lists/0/cards/0/tags/-", value: "patched" },
    { op: "move", from: "/lists/0/cards/1", path: "/lists/1/cards/1" },
  ]);

  const inspectReactFacade = (): unknown => ({
    value: doc.value,
    selection: doc.selection?.snapshot(),
    history: { undo: doc.history.undoDepth, redo: doc.history.redoDepth },
    clipboard: doc.clipboard.read(),
    schema: doc.schema.kind(valueTarget),
  });

  const inspectSubscribe = (): unknown => {
    const events: unknown[] = [];
    const unsubscribe = doc.subscribe((applied, metadata) => {
      events.push({ applied, metadata });
    });
    const applied = doc.patch({ op: "replace", path: "/settings/owner", value: `sub-${doc.history.undoDepth}` });
    unsubscribe();
    return { applied, events };
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
        <ActionGroup title="root exports">
          <ApiRow action={<ActionButton onClick={() => run("createJSONDocument(schema, value, options)", inspectCreateJSONDocument)}>createJSONDocument</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("applyOperation(schema, state, operation)", inspectApplyOperation)}>applyOperation</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("applyPatch(schema, state, patch)", inspectApplyPatch)}>applyPatch</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("applyPatchToTrustedState(schema, state, patch)", inspectApplyPatchToTrustedState)}>applyPatchToTrustedState</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("parsePointer/buildPointer/appendSegment/parentPointer", inspectPointerHelpers)}>pointer helpers</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("trackPointer(pointer, patch)", inspectTrackPointer)}>trackPointer</ActionButton>} />
        </ActionGroup>

        <ActionGroup title="react">
          <ApiRow action={<ActionButton onClick={() => run("useJSONDocument(schema, value, options)", inspectReactFacade)}>useJSONDocument</ActionButton>} />
        </ActionGroup>

        <ActionGroup title="document">
          <ApiRow action={<ActionButton onClick={() => run("doc.value", () => doc.value)}>doc.value</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("doc.lastPatch", () => doc.lastPatch)}>doc.lastPatch</ActionButton>} />
          <ApiRow
            action={<ActionButton disabledReason={canDisabledReason(canAddPayload)} onClick={() => run('doc.patch([{ op: "add", path: "/lists/0/cards/-", value: payload }])', addCardToTodo)}>doc.patch add</ActionButton>}
            can={<ActionButton onClick={() => run('doc.canPatch([{ op: "add", path: "/lists/0/cards/-", value: payload }])', () => canAddPayload)}>canPatch add</ActionButton>}
          />
          <ApiRow
            action={<ActionButton disabledReason={canDisabledReason(canPatchReplaceTitle)} onClick={() => run(`doc.patch([{ op: "replace", path: "${targetTitlePath}", value: textPayload }])`, () => doc.patch([{ op: "replace", path: targetTitlePath, value: textPayload }]))}>doc.patch replace</ActionButton>}
            can={<ActionButton onClick={() => run(`doc.canPatch([{ op: "replace", path: "${targetTitlePath}", value: textPayload }])`, () => canPatchReplaceTitle)}>canPatch replace</ActionButton>}
          />
          <ApiRow
            action={<ActionButton disabledReason={canDisabledReason(canPatchRemoveTarget)} onClick={() => run(`doc.patch([{ op: "remove", path: "${valueTarget}" }])`, () => doc.patch([{ op: "remove", path: valueTarget }]))}>doc.patch remove</ActionButton>}
            can={<ActionButton onClick={() => run(`doc.canPatch([{ op: "remove", path: "${valueTarget}" }])`, () => canPatchRemoveTarget)}>canPatch remove</ActionButton>}
          />
          <ApiRow action={<ActionButton onClick={() => run("doc.patch([...operations], { label: \"doc.patch\" })", patchTwoFields)}>doc.patch batch</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run('doc.patch([{ op: "replace", path: "/lists/0/cards/0/points", value: badPoints }])', invalidPatch)}>doc.patch invalid</ActionButton>} />
          <ApiRow
            action={<ActionButton disabledReason={canDisabledReason(canMoveTarget)} onClick={() => run(`doc.patch({ op: "move", from: "${valueTarget}", path: "${insertTarget}" })`, () => doc.patch({ op: "move", from: valueTarget, path: insertTarget }))}>doc.patch move</ActionButton>}
            can={<ActionButton onClick={() => run(`doc.canMove("${valueTarget}", "${insertTarget}")`, () => canMoveTarget)}>canMove</ActionButton>}
          />
          <ApiRow
            action={<ActionButton disabledReason={canDisabledReason(canReplacePrimaryTitle)} onClick={() => run(`doc.patch({ op: "replace", path: "${primaryTitlePath}", value: textPayload })`, replaceSelectedTitle)}>doc.patch replace selected</ActionButton>}
            can={<ActionButton onClick={() => run(`doc.canReplace("${primaryTitlePath}", textPayload)`, () => canReplacePrimaryTitle)}>canReplace</ActionButton>}
          />
          <ApiRow
            action={<ActionButton disabledReason={canDisabledReason(canRemoveSource)} onClick={() => run("doc.patch(selectedPointers.map((path) => ({ op: \"remove\", path })))", removeTargets)}>doc.patch remove selected</ActionButton>}
            can={<ActionButton onClick={() => run("doc.canRemove(source)", () => canRemoveSource)}>canRemove</ActionButton>}
          />
          <ApiRow action={<ActionButton onClick={() => run("doc.commit(patch, { selection })", commitAddWithSelection)}>doc.commit</ActionButton>} />
          <ApiRow
            action={<ActionButton disabledReason={canDisabledReason(canDuplicateTarget)} onClick={() => run(`doc.duplicate("${valueTarget}", { rekey })`, duplicateTarget)}>doc.duplicate</ActionButton>}
            can={<ActionButton onClick={() => run(`doc.canDuplicate("${valueTarget}", { rekey })`, () => canDuplicateTarget)}>canDuplicate</ActionButton>}
          />
          <ApiRow action={<ActionButton onClick={() => run("doc.load(nextValue)", loadFixture)}>doc.load</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("doc.reset()", () => doc.reset())}>doc.reset</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("doc.subscribe(listener)", inspectSubscribe)}>doc.subscribe</ActionButton>} />
        </ActionGroup>

        <ActionGroup title="read">
          <ApiRow action={<ActionButton onClick={() => run(`doc.at("${valueTarget}")`, () => doc.at(valueTarget))}>doc.at</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run(`doc.exists("${valueTarget}")`, () => doc.exists(valueTarget))}>doc.exists</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run('doc.entries("/lists/0/cards")', () => doc.entries("/lists/0/cards" as Pointer))}>doc.entries</ActionButton>} />
          <ApiRow
            action={<ActionButton onClick={() => run(`doc.query(${JSON.stringify(query)})`, queryPointers)}>doc.query</ActionButton>}
            can={<ActionButton onClick={() => run(`doc.canFind(${JSON.stringify(query)})`, () => doc.canFind(query))}>canFind</ActionButton>}
          />
        </ActionGroup>

        <ActionGroup title="can">
          <ApiRow action={<ActionButton onClick={() => run("doc.canPatch([{ op: \"replace\", path: \"/title\", value: textPayload }])", () => doc.canPatch([{ op: "replace", path: "/title", value: textPayload }]))}>doc.canPatch</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run(`doc.canFind(${JSON.stringify(query)})`, () => doc.canFind(query))}>doc.canFind</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run(`doc.canReplace("${targetPointsPath}", pointsPayload)`, () => doc.canReplace(targetPointsPath, pointsValue))}>doc.canReplace ok</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run(`doc.canReplace("${targetPointsPath}", badPoints)`, () => doc.canReplace(targetPointsPath, badPointsValue))}>doc.canReplace bad</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("doc.canRemove(source)", () => doc.canRemove(selectedSource))}>doc.canRemove</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run(`doc.canMove("${valueTarget}", "${insertTarget}")`, () => doc.canMove(valueTarget, insertTarget))}>doc.canMove</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run(`doc.canDuplicate("${valueTarget}", { rekey })`, () => doc.canDuplicate(valueTarget, { rekey: cardRekey() }))}>doc.canDuplicate</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("doc.canCopy(source)", () => doc.canCopy(selectedSource))}>doc.canCopy</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("doc.canCut(source)", () => doc.canCut(selectedSource))}>doc.canCut</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run(`doc.canPaste("${insertTarget}", { spread: true, rekey })`, () => doc.canPaste(insertTarget, { spread: true, rekey: cardRekey() }))}>doc.canPaste</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run(`doc.canPastePayload({ after: "${valueTarget}" }, payload)`, () => doc.canPastePayload({ after: valueTarget }, parsedPayload(), { rekey: cardRekey() }))}>doc.canPastePayload after</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run(`doc.canPastePayload("${insertTarget}", payload)`, () => doc.canPastePayload(insertTarget, parsedPayload()))}>doc.canPastePayload insert</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("({ undo: doc.canUndo(), redo: doc.canRedo() })", () => ({ undo: doc.canUndo(), redo: doc.canRedo() }))}>doc.canUndo/Redo</ActionButton>} />
        </ActionGroup>

        <ActionGroup title="selection">
          <ApiRow action={<ActionButton onClick={() => run(`doc.selection?.collapse("${valueTarget}")`, () => { doc.selection?.collapse(valueTarget); return doc.selection?.snapshot(); })}>selection.collapse</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run(`doc.selection?.togglePointer("${valueTarget}")`, () => { doc.selection?.togglePointer(valueTarget); return doc.selection?.snapshot(); })}>selection.togglePointer</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("doc.selection?.selectRanges(todoPointers)", selectTodoCards)}>selection.selectRanges</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run('doc.selection?.moveCursor("next")', () => doc.selection?.moveCursor("next"))}>selection.moveCursor</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run('doc.selection?.extendCursor("next")', () => doc.selection?.extendCursor("next"))}>selection.extendCursor</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run('doc.selection?.selectScope({ scope: "/lists/0/cards" })', () => doc.selection?.selectScope({ scope: "/lists/0/cards" }))}>selection.selectScope</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run('doc.selection?.collapse({ path: "/title", offset: 0 })', selectTitleText)}>selection.textPoint</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("doc.selection?.textPatch(textPayload)", replaceTitleText)}>selection.textPatch</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("doc.selection?.empty()", () => { doc.selection?.empty(); return doc.selection?.snapshot(); })}>selection.empty</ActionButton>} />
        </ActionGroup>

        <ActionGroup title="clipboard">
          <ApiRow
            action={<ActionButton disabledReason={canDisabledReason(canCopySource)} onClick={() => run("doc.clipboard.copy(source)", copySelection)}>clipboard.copy</ActionButton>}
            can={<ActionButton onClick={() => run("doc.canCopy(source)", () => canCopySource)}>canCopy</ActionButton>}
          />
          <ApiRow
            action={<ActionButton disabledReason={canDisabledReason(canCutSource)} onClick={() => run("doc.clipboard.cut(source)", () => doc.clipboard.cut(selectedSource))}>clipboard.cut</ActionButton>}
            can={<ActionButton onClick={() => run("doc.canCut(source)", () => canCutSource)}>canCut</ActionButton>}
          />
          <ApiRow
            action={<ActionButton disabledReason={canDisabledReason(canPasteClipboardAfterTarget)} onClick={() => run(`doc.clipboard.paste({ after: "${valueTarget}" })`, pasteClipboardAfterTarget)}>clipboard.paste after</ActionButton>}
            can={<ActionButton onClick={() => run(`doc.canPaste({ after: "${valueTarget}" })`, () => canPasteClipboardAfterTarget)}>canPaste after</ActionButton>}
          />
          <ApiRow
            action={<ActionButton disabledReason={canDisabledReason(canPasteClipboardToInsertTarget)} onClick={() => run(`doc.clipboard.paste("${insertTarget}", { spread: true, rekey })`, pasteClipboardToInsertTarget)}>clipboard.paste insert</ActionButton>}
            can={<ActionButton onClick={() => run(`doc.canPaste("${insertTarget}", { spread: true, rekey })`, () => canPasteClipboardToInsertTarget)}>canPaste insert</ActionButton>}
          />
          <ApiRow
            action={<ActionButton disabledReason={canDisabledReason(canPastePayloadAfterTarget)} onClick={() => run(`doc.clipboard.pastePayload({ after: "${valueTarget}" }, payload, { rekey })`, pastePayloadAfterTarget)}>clipboard.pastePayload after</ActionButton>}
            can={<ActionButton onClick={() => run(`doc.canPastePayload({ after: "${valueTarget}" }, payload, { rekey })`, () => canPastePayloadAfterTarget)}>canPastePayload after</ActionButton>}
          />
          <ApiRow
            action={<ActionButton disabledReason={canDisabledReason(canPastePayloadToInsertTarget)} onClick={() => run(`doc.clipboard.pastePayload("${insertTarget}", payload, { rekey })`, pastePayloadToInsertTarget)}>clipboard.pastePayload insert</ActionButton>}
            can={<ActionButton onClick={() => run(`doc.canPastePayload("${insertTarget}", payload, { rekey })`, () => canPastePayloadToInsertTarget)}>canPastePayload insert</ActionButton>}
          />
          <ApiRow action={<ActionButton onClick={() => run(`doc.clipboard.write(payload, { source: "${valueTarget}" })`, () => doc.clipboard.write(parsedPayload(), { source: valueTarget }))}>clipboard.write</ActionButton>} />
          <ApiRow action={<ActionButton disabledReason={clipboardEmptyReason} disabledMark="state" onClick={() => run("doc.clipboard.read()", () => doc.clipboard.read())}>clipboard.read</ActionButton>} />
          <ApiRow action={<ActionButton disabledReason={clipboardEmptyReason} disabledMark="state" onClick={() => run("doc.clipboard.clear()", () => { doc.clipboard.clear(); return doc.clipboard.read(); })}>clipboard.clear</ActionButton>} />
        </ActionGroup>

        <ActionGroup title="history">
          <ApiRow
            action={<ActionButton onClick={() => run("doc.history.undo()", () => doc.history.undo())} disabledReason={canDisabledReason(doc.canUndo())}>history.undo</ActionButton>}
            can={<ActionButton onClick={() => run("doc.canUndo()", () => doc.canUndo())}>canUndo</ActionButton>}
          />
          <ApiRow
            action={<ActionButton onClick={() => run("doc.history.redo()", () => doc.history.redo())} disabledReason={canDisabledReason(doc.canRedo())}>history.redo</ActionButton>}
            can={<ActionButton onClick={() => run("doc.canRedo()", () => doc.canRedo())}>canRedo</ActionButton>}
          />
          <ApiRow action={<ActionButton onClick={() => run("doc.history.transaction(options, fn)", transactionRename)}>history.transaction</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run('doc.history.mergeLast({ mergeKey: "manual" })', () => doc.history.mergeLast({ mergeKey: "manual" }))}>history.mergeLast</ActionButton>} />
        </ActionGroup>

        <ActionGroup title="schema">
          <ApiRow action={<ActionButton onClick={() => run(`doc.schema.kind("${valueTarget}")`, () => doc.schema.kind(valueTarget))}>schema.kind</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run(`doc.schema.at("${valueTarget}")`, () => doc.schema.at(valueTarget))}>schema.at</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run(`doc.schema.describe("${insertTarget}", "insert")`, () => doc.schema.describe(insertTarget, "insert"))}>schema.describe</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run(`doc.schema.accepts("${insertTarget}", payload, "insert")`, () => doc.schema.accepts(insertTarget, parsedPayload(), "insert"))}>schema.accepts valid</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run(`doc.schema.accepts("${insertTarget}", invalidCard, "insert")`, () => doc.schema.accepts(insertTarget, invalidCard, "insert"))}>schema.accepts invalid</ActionButton>} />
        </ActionGroup>
      </section>

      <section className="grid gap-3 lg:grid-cols-3">
        <Inspect title="selection state" value={{ selected: selectedLabel(selectedPointers), primary: primaryPointer, snapshot: doc.selection?.snapshot() }} />
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
      <div className="grid gap-1.5">{children}</div>
    </div>
  );
}

function ApiRow({ action, can }: { action: ReactNode; can?: ReactNode }) {
  return (
    <div className={can ? "grid grid-cols-[minmax(0,1fr)_minmax(6rem,0.72fr)] gap-1.5" : "grid"}>
      {action}
      {can}
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
