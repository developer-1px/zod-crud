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
  JSONCrudError,
  lastSegment,
  lastSegmentIndex,
  parentPointer,
  parsePointer,
  PointerSyntaxError,
  trackPointer,
  tryParsePointer,
  unescapeSegment,
  withLastSegment,
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
type BenchResult = {
  call: string;
  value: unknown;
  feature?: string;
  bindings?: readonly string[];
  effect?: readonly string[];
};

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

const publicTypeExports = [
  "HistoryTransactionOptions",
  "JSONCapabilityResult",
  "JSONChangeMetadata",
  "JSONDocument",
  "JSONDocumentCommitOptions",
  "JSONDocumentDuplicateOptions",
  "JSONDocumentDuplicateResult",
  "JSONDocumentHistory",
  "JSONDocumentPasteOptions",
  "JSONDocumentPasteTarget",
  "JSONPatchInput",
  "JSONPatchOperation",
  "JSONPoint",
  "JSONResult",
  "Pointer",
  "UseJSONDocumentOptions",
  "ClipboardCopyOptions",
  "ClipboardCutOk",
  "ClipboardCutOptions",
  "ClipboardCutResult",
  "ClipboardEmpty",
  "ClipboardMutationOk",
  "ClipboardPasteResult",
  "ClipboardReadOk",
  "ClipboardReadOptions",
  "ClipboardReadResult",
  "ClipboardState",
  "ClipboardWriteOptions",
  "EntriesResult",
  "EntryKind",
  "QueryResult",
  "ReadEntry",
  "ReadResult",
  "SchemaDescription",
  "SchemaDescriptionResult",
  "SchemaErrorCode",
  "SchemaErrorResult",
  "SchemaKind",
  "SchemaKindResult",
  "SchemaPathMode",
  "SchemaQueryResult",
  "SchemaState",
  "UseSelectionOptions",
  "JSONPointObject",
  "OrderedSelectionRange",
  "OrderedSelectionRangeEntry",
  "SelectionAction",
  "SelectionAffinity",
  "SelectionContext",
  "SelectionCursorDirection",
  "SelectionCursorErrorCode",
  "SelectionCursorOptions",
  "SelectionCursorResult",
  "SelectionCursorTarget",
  "SelectionDirection",
  "SelectionEdge",
  "SelectionMode",
  "SelectionOrderErrorCode",
  "SelectionOrderOptions",
  "SelectionPointOrderResult",
  "SelectionPointerSpan",
  "SelectionPointerSpansResult",
  "SelectionRange",
  "SelectionRangeInput",
  "SelectionRangeOrderResult",
  "SelectionRangesOrderResult",
  "SelectionScopeErrorCode",
  "SelectionScopeOptions",
  "SelectionScopeResult",
  "SelectionScopeTarget",
  "SelectionSnap",
  "SelectionSource",
  "SelectionSpanOptions",
  "SelectionState",
  "SelectionType",
  "DeleteSelectionTextResult",
  "ReplaceSelectionTextResult",
  "SelectionTextDeleteDirection",
  "SelectionTextDeleteOptions",
  "SelectionTextEdit",
  "SelectionTextEditErrorCode",
  "SelectionTextEditOptions",
  "SelectionTextEditsResult",
  "ClipboardSource",
  "CopyError",
  "CopyOk",
  "CutError",
  "CutOk",
  "DuplicateError",
  "DuplicateOk",
  "PasteDuMismatch",
  "PasteError",
  "PasteOptions",
  "PasteTarget",
];

const publicTypeGroups = [
  {
    label: "Document and patch",
    note: "used by Add, Edit, Move, Duplicate",
    items: [
      "JSONDocument",
      "JSONPatchInput",
      "JSONPatchOperation",
      "JSONResult",
      "JSONCapabilityResult",
      "JSONChangeMetadata",
      "Pointer",
    ],
  },
  {
    label: "History",
    note: "used by Undo and redo",
    items: [
      "JSONDocumentHistory",
      "JSONDocumentCommitOptions",
      "HistoryTransactionOptions",
    ],
  },
  {
    label: "Selection",
    note: "used by Find and Bulk cards",
    items: publicTypeExports.filter((item) => item.includes("Selection") || item === "JSONPoint" || item === "JSONPointObject" || item === "OrderedSelectionRange" || item === "OrderedSelectionRangeEntry"),
  },
  {
    label: "Clipboard",
    note: "used by Copy and paste",
    items: publicTypeExports.filter((item) => item.includes("Clipboard") || item.includes("Copy") || item.includes("Cut") || item.includes("Paste") || item.includes("Duplicate")),
  },
  {
    label: "Schema and read",
    note: "used by Read schema",
    items: publicTypeExports.filter((item) => item.includes("Schema") || item.includes("Read") || item.includes("Entries") || item.includes("Query") || item === "EntryKind"),
  },
];

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

function capabilityStatus(result: JSONCapabilityResult): string {
  return result.ok ? "ok" : result.code;
}

function disabledMark(reason: string | undefined): string {
  if (!reason) return "cannot";
  if (reason.startsWith("state: ")) return `cannot ${reason.slice("state: ".length)}`;
  if (!reason.startsWith("can: ")) return "cannot";
  const code = reason.slice("can: ".length).split(":")[0]?.trim().split(" ")[0];
  return code ? `cannot ${code}` : "cannot";
}

function resultSummary(value: unknown, call = ""): string[] {
  if (value === null || typeof value !== "object") return [String(value)];
  const record = value as Record<string, unknown>;
  const lines: string[] = [];
  if (typeof record.ok === "boolean") {
    lines.push(record.ok ? "ok true" : `ok false ${String(record.code ?? "")}`.trim());
  }
  if (Array.isArray(record.applied)) {
    lines.push(...record.applied.slice(0, 3).map((operation) => {
      const op = operation as { op?: unknown; path?: unknown; from?: unknown };
      return [op.op, op.from ? `from ${String(op.from)}` : null, op.path ? `path ${String(op.path)}` : null]
        .filter(Boolean)
        .join(" ");
    }));
  }
  if (typeof record.duplicatedTo === "string") lines.push(`duplicatedTo ${record.duplicatedTo}`);
  if (typeof record.pointer === "string") lines.push(`pointer ${record.pointer}`);
  if (typeof record.kind === "string") lines.push(`kind ${record.kind}`);
  if (typeof record.type === "string") lines.push(`type ${record.type}`);
  if (typeof record.path === "string") lines.push(`path ${record.path}`);
  if (Array.isArray(record.entries)) lines.push(`entries ${record.entries.length}`);
  if (Array.isArray(record.pointers)) lines.push(`pointers ${record.pointers.length}`);
  if (Array.isArray(record.selectedPointers)) lines.push(`selected ${record.selectedPointers.length}`);
  if (Array.isArray(record.events)) lines.push(`events ${record.events.length}`);
  if (Array.isArray(record.patch)) lines.push(`patch ${record.patch.length}`);
  if (Array.isArray(record.parsePointer)) lines.push(`segments ${record.parsePointer.join("/")}`);
  if (typeof record.buildPointer === "string") lines.push(`buildPointer ${record.buildPointer}`);
  if (call.includes("schema.describe")) lines.push("schema insert");
  if (call.includes("clipboard.clear") && record.hasData === false) lines.push("clipboard empty");
  if (call.includes("selection?.textPatch")) lines.push("text patch");
  if (Array.isArray(record.violations) && record.violations.length > 0) {
    const first = record.violations[0] as { path?: unknown; message?: unknown };
    lines.push(`violation ${String(first.path ?? "")} ${String(first.message ?? "")}`.trim());
  }
  if ("value" in record) lines.push(...valueSummary(record.value));
  return lines.length > 0 ? lines : ["object returned"];
}

function valueSummary(value: unknown): string[] {
  if (value === null) return ["value null"];
  if (Array.isArray(value)) return [`array ${value.length}`];
  if (typeof value !== "object") return [`value ${String(value)}`];
  const record = value as Record<string, unknown>;
  if (typeof record.title === "string" && typeof record.status === "string") return [`card "${record.title}"`];
  if (typeof record.title === "string") return [`title "${record.title}"`];
  if (typeof record.name === "string") return [`name "${record.name}"`];
  const keys = Object.keys(record);
  return keys.length > 0 ? [`value keys ${keys.slice(0, 3).join(",")}`] : ["value object"];
}

function isBoard(value: unknown): value is Board {
  return BoardSchema.safeParse(value).success;
}

function resultBoard(value: unknown, fallback: Board): Board {
  if (isBoard(value)) return value;
  if (value !== null && typeof value === "object" && "value" in value) {
    const next = (value as { value?: unknown }).value;
    if (isBoard(next)) return next;
  }
  return fallback;
}

function operationEffects(value: unknown): string[] {
  if (value === null || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  const effects: string[] = [];
  if (typeof record.duplicatedTo === "string") effects.push(`duplicated to ${record.duplicatedTo}`);
  if (!Array.isArray(record.applied)) return effects;

  for (const operation of record.applied.slice(0, 4)) {
    const op = operation as { op?: unknown; path?: unknown; from?: unknown };
    const path = typeof op.path === "string" ? op.path : "";
    const from = typeof op.from === "string" ? op.from : "";
    if (op.op === "add") effects.push(`added ${path}`);
    else if (op.op === "remove") effects.push(`removed ${path}`);
    else if (op.op === "replace") effects.push(`replaced ${path}`);
    else if (op.op === "move") effects.push(`moved ${from} -> ${path}`);
    else if (op.op === "copy") effects.push(`copied ${from} -> ${path}`);
    else if (typeof op.op === "string") effects.push(`${op.op} ${path}`.trim());
  }
  return effects;
}

function boardEffect(before: Board, after: Board): string[] {
  const effects: string[] = [];
  const beforeCounts = before.lists.map((list) => list.cards.length).join("/");
  const afterCounts = after.lists.map((list) => list.cards.length).join("/");
  if (beforeCounts !== afterCounts) effects.push(`cards ${beforeCounts} -> ${afterCounts}`);

  const beforeCards = flattenCards(before);
  const afterCards = flattenCards(after);
  const beforeById = new Map(beforeCards.map((item) => [item.card.id, item]));
  const afterById = new Map(afterCards.map((item) => [item.card.id, item]));

  if (afterCards.length < beforeCards.length) {
    for (const item of beforeCards) {
      if (!afterById.has(item.card.id)) {
        effects.push(`removed ${item.card.title} ${item.pointer}`);
        return effects;
      }
    }
    const index = firstDifferentCardIndex(beforeCards, afterCards);
    const removed = beforeCards[index] ?? beforeCards[beforeCards.length - 1];
    if (removed) {
      effects.push(`removed ${removed.card.title} ${removed.pointer}`);
      return effects;
    }
  }

  if (afterCards.length > beforeCards.length) {
    for (const item of afterCards) {
      if (!beforeById.has(item.card.id)) {
        effects.push(`added ${item.card.title} ${item.pointer}`);
        return effects;
      }
    }
    const index = firstDifferentCardIndex(afterCards, beforeCards);
    const added = afterCards[index] ?? afterCards[afterCards.length - 1];
    if (added) {
      effects.push(`added ${added.card.title} ${added.pointer}`);
      return effects;
    }
  }

  for (const item of beforeCards) {
    const next = afterById.get(item.card.id);
    if (next && next.pointer !== item.pointer) {
      effects.push(`moved ${item.card.title} ${item.pointer} -> ${next.pointer}`);
      return effects;
    }
  }

  for (let listIndex = 0; listIndex < Math.min(before.lists.length, after.lists.length); listIndex += 1) {
    const beforeCards = before.lists[listIndex]?.cards ?? [];
    const afterCards = after.lists[listIndex]?.cards ?? [];
    for (let cardIndex = 0; cardIndex < Math.min(beforeCards.length, afterCards.length); cardIndex += 1) {
      const beforeCard = beforeCards[cardIndex];
      const afterCard = afterCards[cardIndex];
      if (beforeCard && afterCard && beforeCard.id === afterCard.id && beforeCard.title !== afterCard.title) {
        effects.push(`title ${cardPointer(listIndex, cardIndex)}: ${beforeCard.title} -> ${afterCard.title}`);
        return effects;
      }
    }
  }
  return effects;
}

function flattenCards(board: Board): Array<{
  pointer: Pointer;
  card: Board["lists"][number]["cards"][number];
}> {
  return board.lists.flatMap((list, listIndex) =>
    list.cards.map((card, cardIndex) => ({
      pointer: cardPointer(listIndex, cardIndex),
      card,
    })),
  );
}

function firstDifferentCardIndex(
  left: Array<{ card: Board["lists"][number]["cards"][number] }>,
  right: Array<{ card: Board["lists"][number]["cards"][number] }>,
): number {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const leftCard = left[index]?.card;
    const rightCard = right[index]?.card;
    if (!leftCard || !rightCard || leftCard.id !== rightCard.id || leftCard.title !== rightCard.title) {
      return index;
    }
  }
  return Math.max(0, left.length - 1);
}

function cardTitleAt(board: Board, pointer: Pointer): string | null {
  const segments = tryParsePointer(pointer);
  if (!segments || segments.length !== 4 || segments[0] !== "lists" || segments[2] !== "cards") return null;
  const listIndex = Number(segments[1]);
  const cardIndex = Number(segments[3]);
  return board.lists[listIndex]?.cards[cardIndex]?.title ?? null;
}

function mutatesBoard(call: string): boolean {
  return call.includes("doc.patch(")
    || call.includes("doc.commit(")
    || call.includes("doc.duplicate(")
    || call.includes("doc.clipboard.cut(")
    || call.includes("doc.clipboard.paste(")
    || call.includes("doc.clipboard.pastePayload(")
    || call.includes("doc.history.undo(")
    || call.includes("doc.history.redo(")
    || call.includes("doc.history.transaction(");
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

function statusForInsertTarget(board: Board, target: Pointer): Board["lists"][number]["cards"][number]["status"] | null {
  const segments = tryParsePointer(target);
  if (!segments || segments[0] !== "lists" || segments[2] !== "cards") return null;
  const listIndex = Number(segments[1]);
  const listId = board.lists[listIndex]?.id;
  if (listId === "todo" || listId === "doing" || listId === "done") return listId;
  return null;
}

function payloadWithStatus(payloadText: string, status: Board["lists"][number]["cards"][number]["status"]): string {
  const parsed = parseJson(payloadText);
  if (!parsed.ok || parsed.value === null || typeof parsed.value !== "object" || Array.isArray(parsed.value)) {
    return payloadText;
  }
  return stringify({ ...parsed.value, status });
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
  const [featureResults, setFeatureResults] = useState<Record<string, BenchResult>>({});

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
  const primarySource = valueTarget;
  const targetTitlePath = `${valueTarget}/title` as Pointer;
  const targetPointsPath = `${valueTarget}/points` as Pointer;
  const canAddPayload = doc.canPatch([{ op: "add", path: insertTarget, value: payloadValue }]);
  const canPatchReplaceTitle = doc.canPatch([{ op: "replace", path: targetTitlePath, value: textPayload }]);
  const canPatchRemoveTarget = doc.canPatch([{ op: "remove", path: valueTarget }]);
  const canDuplicateTarget = doc.canDuplicate(valueTarget, { rekey: cardRekey() });
  const canMoveTarget = doc.canMove(valueTarget, insertTarget);
  const canReplaceTargetTitle = doc.canReplace(targetTitlePath, textPayload);
  const canPastePayloadAfterTarget = doc.canPastePayload({ after: valueTarget }, payloadValue, { rekey: cardRekey() });
  const canRemoveSource = doc.canRemove(selectedSource);
  const canCopySource = doc.canCopy(selectedSource);
  const canCopyPrimary = doc.canCopy(primarySource);
  const canCutSource = doc.canCut(selectedSource);
  const canPasteClipboardAfterTarget = doc.canPaste({ after: valueTarget });
  const canPasteClipboardToInsertTarget = doc.canPaste(insertTarget, { spread: true, rekey: cardRekey() });
  const canPastePayloadToInsertTarget = doc.canPastePayload(insertTarget, payloadValue, { rekey: cardRekey() });
  const selectedCount = selectedPointers.length;
  const selectedCardReason = selectedCount === 1
    ? undefined
    : selectedCount === 0
      ? "state: select_one_card"
      : "state: single_card_only";
  const bulkSelectionReason = selectedCount > 1 ? undefined : "state: select_multiple_cards";

  const run = (call: string, action: () => unknown, feature?: string): void => {
    const before = doc.value;
    const bindings = feature ? featureBindings(feature, call, before) : [];
    try {
      const value = action();
      const output = value ?? doc.value;
      const effects = operationEffects(output);
      const next: BenchResult = {
        call,
        value: output,
        feature,
        bindings,
        effect: effects.length > 0
          ? effects
          : mutatesBoard(call)
            ? boardEffect(before, resultBoard(output, doc.value))
            : [],
      };
      setResult(next);
      if (feature) {
        setFeatureResults((current) => (
          call.includes("doc.load(") || call.includes("doc.reset(")
            ? { [feature]: next }
            : { ...current, [feature]: next }
        ));
      }
    } catch (error) {
      const next: BenchResult = {
        call,
        value: error instanceof Error ? error.message : error,
        feature,
        bindings,
        effect: [],
      };
      setResult(next);
      if (feature) setFeatureResults((current) => ({ ...current, [feature]: next }));
    }
  };

  const featureResult = (feature: string): BenchResult | undefined => (
    featureResults[feature]
  );

  const changeInsertTarget = (target: Pointer): void => {
    setInsertTarget(target);
    const status = statusForInsertTarget(doc.value, target);
    if (status) setPayload((current) => payloadWithStatus(current, status));
  };

  const selectNoCards = (): unknown => {
    doc.selection?.empty();
    return doc.selection?.snapshot();
  };

  const selectFirstCard = (): unknown => {
    const pointer = cardPointer(0, 0);
    setValueTarget(pointer);
    doc.selection?.collapse(pointer);
    return doc.selection?.snapshot();
  };

  const featureBindings = (feature: string, call: string, board: Board): string[] => {
    const title = cardTitleAt(board, valueTarget);
    if (feature === "Add card") {
      const card = payloadValue as { title?: unknown; status?: unknown };
      return [
        `target ${insertTarget}`,
        `payload ${card.title ?? "payload"}`,
        `status ${card.status ?? "payload"}`,
      ];
    }
    if (feature === "Edit card") return [`path ${targetTitlePath}`, `value ${textPayload}`];
    if (feature === "Move card") return [`source ${valueTarget}`, `target ${insertTarget}`, title ? `card ${title}` : "card unknown"];
    if (feature === "Duplicate card") return [`source ${valueTarget}`, title ? `card ${title}` : "card unknown", "rekey id:suffix"];
    if (feature === "Find and select") return [`query ${query}`];
    if (feature === "Copy and paste") {
      if (call.includes("canCopy") || call.includes("copy(")) return [`source ${primarySource}`, title ? `card ${title}` : "card unknown"];
      if (call.includes("after")) return [`target after ${valueTarget}`, title ? `after ${title}` : "after unknown"];
      return [`target ${insertTarget}`];
    }
    if (feature === "Bulk cards") return [`source ${selectedLabel(Array.isArray(selectedSource) ? selectedSource : [selectedSource])}`];
    if (feature === "Selection set") return [`selected ${selectedCount}`];
    if (feature === "Undo and redo") return [`undo ${doc.history.undoDepth}`, `redo ${doc.history.redoDepth}`];
    if (feature === "Read schema") {
      if (call.includes("schema.")) return [`schema target ${insertTarget}`];
      if (call.includes("entries")) return ['entries /lists/0/cards'];
      return [`value ${valueTarget}`];
    }
    if (feature === "Board plumbing") {
      if (call.includes("doc.load(")) return ["fixture Loaded fixture"];
      if (call.includes("doc.reset(")) return ["initial board"];
      if (call.includes("doc.subscribe(")) return ["watch /settings/owner"];
      if (call.includes("applyPatch(")) return ["external patch"];
      if (call.includes("pointer helpers")) return ["path /lists/0/cards/0/title"];
      if (call.includes("trackPointer(")) return ["track /lists/0/cards/1/title"];
      if (call.includes("clipboard.write(")) return [`source ${valueTarget}`];
      if (call.includes("clipboard.clear(")) return ["clipboard buffer"];
      if (call.includes("selection?.textPatch(")) return [`text ${textPayload}`];
      if (call.includes("schema.kind(")) return [`value ${valueTarget}`];
    }
    return [];
  };

  const parsedPayload = (): unknown => {
    return payloadValue;
  };

  const addCardToTodo = (): unknown => {
    return doc.patch([
      { op: "add", path: insertTarget, value: parsedPayload() },
    ]);
  };

  const replaceSelectedTitle = (): unknown => {
    return doc.patch({ op: "replace", path: targetTitlePath, value: textPayload });
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

  const copyPrimaryCard = (): unknown => doc.clipboard.copy(primarySource);

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

  const commitReplaceTitle = (): unknown => {
    return doc.commit(
      [{ op: "replace", path: targetTitlePath, value: textPayload }],
      { label: "commit", selection: { type: "collapse", point: valueTarget } },
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

  const inspectBoundaryErrors = (): unknown => {
    let pointerError = false;
    try {
      parsePointer("lists/0/cards/0" as Pointer);
    } catch (error) {
      pointerError = error instanceof PointerSyntaxError;
    }
    const crudError = new JSONCrudError("patch", {
      ok: false,
      code: "path_not_found",
      reason: "demo",
    } as never);
    return {
      JSONCrudError: { name: crudError.name, message: crudError.message },
      PointerSyntaxError: pointerError,
    };
  };

  const inspectPointerHelpers = (): unknown => {
    return {
      parsePointer: parsePointer("/lists/0/cards/0"),
      tryParsePointer: tryParsePointer("/lists/0/cards/0"),
      buildPointer: buildPointer(["lists", 0, "cards", 0]),
      appendSegment: appendSegment("/lists/0/cards", 0),
      parentPointer: parentPointer("/lists/0/cards/0/title"),
      lastSegment: lastSegment("/lists/0/cards/0/title"),
      lastSegmentIndex: lastSegmentIndex("/lists/0/cards/12"),
      withLastSegment: withLastSegment("/lists/0/cards/0/title", "points"),
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

  const inspectSelectionReads = (): unknown => ({
    selectedPointers: doc.selection?.selectedPointers,
    selectionRanges: doc.selection?.selectionRanges,
    primaryIndex: doc.selection?.primaryIndex,
    rangeCount: doc.selection?.rangeCount,
    selectedCount: doc.selection?.selectedCount,
    hasSelection: doc.selection?.hasSelection,
    isCollapsed: doc.selection?.isCollapsed,
    type: doc.selection?.type,
    primaryRange: doc.selection?.primaryRange,
    anchorPointer: doc.selection?.anchorPointer,
    focusPointer: doc.selection?.focusPointer,
    selectedSource: doc.selection?.selectedSource,
    primaryPointer: doc.selection?.primaryPointer,
    caret: doc.selection?.caret,
    caretPointer: doc.selection?.caretPointer,
    context: doc.selection?.context,
    anchor: doc.selection?.anchor,
    focus: doc.selection?.focus,
  });

  const selectionRestoreRoundtrip = (): unknown => {
    const snap = doc.selection?.snapshot();
    doc.selection?.empty();
    if (snap) doc.selection?.restore(snap);
    return doc.selection?.snapshot();
  };

  const selectionSubscribeOnce = (): unknown => {
    const events: unknown[] = [];
    const unsubscribe = doc.selection?.subscribe((snapshot, previous) => {
      events.push({ snapshot, previous });
    });
    doc.selection?.collapse(valueTarget);
    unsubscribe?.();
    return events;
  };

  const resetTargets = (): void => {
    setValueTarget(cardPointer(0, 0));
    setInsertTarget("/lists/0/cards/-" as Pointer);
  };

  const loadFixture = (): unknown => {
    resetTargets();
    return doc.load({
      ...initialBoard,
      title: "Loaded fixture",
      settings: { archived: true, owner: "fixture" },
    });
  };
  const resetBoard = (): unknown => {
    resetTargets();
    return doc.reset();
  };
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
            <Badge>selected {selectedCount}</Badge>
            <Badge>undo {doc.history.undoDepth}</Badge>
            <Badge>redo {doc.history.redoDepth}</Badge>
            <Badge>clipboard {doc.clipboard.hasData ? "set" : "empty"}</Badge>
            <ActionButton onClick={() => run("doc.selection?.empty()", selectNoCards, "Selection set")}>select 0</ActionButton>
            <ActionButton onClick={() => run(`doc.selection?.collapse("${cardPointer(0, 0)}")`, selectFirstCard, "Selection set")}>select 1</ActionButton>
            <ActionButton onClick={() => run("doc.selection?.selectRanges(todoPointers)", selectTodoCards, "Selection set")}>select N</ActionButton>
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
              onChange={(event) => changeInsertTarget(event.target.value as Pointer)}
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
        <FeaturePanel
          title="Create board"
          api="useJSONDocument / createJSONDocument"
          code={["const doc = useJSONDocument(BoardSchema, initialBoard, { history, selection })"]}
          result={featureResult("Create board")}
          meta={[
            "history 100",
            "selection extended",
            `selected ${selectedPointers.length}`,
            "types JSONDocument",
          ]}
        >
          <ApiRow action={<ActionButton onClick={() => run("useJSONDocument(schema, initial, options)", inspectReactFacade, "Create board")}>useJSONDocument</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("createJSONDocument(schema, initial, options)", inspectCreateJSONDocument, "Create board")}>createJSONDocument</ActionButton>} />
        </FeaturePanel>

        <FeaturePanel
          title="Add card"
          api="canPatch -> patch"
          code={[
            `doc.canPatch([{ op: "add", path: "${insertTarget}", value }])`,
            `doc.patch([{ op: "add", path: "${insertTarget}", value }]) -> JSONResult`,
          ]}
          result={featureResult("Add card")}
          meta={[
            `target ${insertTarget}`,
            `schema ${capabilityStatus(doc.schema.accepts(insertTarget, parsedPayload(), "insert"))}`,
            `can ${capabilityStatus(canAddPayload)}`,
            "types JSONPatchInput -> JSONResult",
          ]}
        >
          <ApiRow
            action={<ActionButton onClick={() => run(`doc.canPatch([{ op: "add", path: "${insertTarget}", value: payload }])`, () => canAddPayload, "Add card")}>doc.canPatch</ActionButton>}
            can={<ActionButton disabledReason={canDisabledReason(canAddPayload)} onClick={() => run(`doc.patch([{ op: "add", path: "${insertTarget}", value: payload }])`, addCardToTodo, "Add card")}>doc.patch</ActionButton>}
          />
        </FeaturePanel>

        <FeaturePanel
          title="Edit card"
          api="canReplace -> patch / commit"
          code={['doc.canReplace(path, value)', 'doc.patch([{ op: "replace", path, value }])']}
          result={featureResult("Edit card")}
          meta={[`field ${targetTitlePath}`, `can ${capabilityStatus(canPatchReplaceTitle)}`, "types JSONPatchInput -> JSONResult"]}
        >
          <ApiRow action={<ActionButton onClick={() => run(`doc.canReplace("${targetTitlePath}", textPayload)`, () => canReplaceTargetTitle, "Edit card")}>doc.canReplace</ActionButton>} />
          <ApiRow
            action={<ActionButton onClick={() => run(`doc.canPatch([{ op: "replace", path: "${targetTitlePath}", value: textPayload }])`, () => canPatchReplaceTitle, "Edit card")}>doc.canPatch</ActionButton>}
            can={<ActionButton disabledReason={canDisabledReason(canPatchReplaceTitle)} onClick={() => run(`doc.patch([{ op: "replace", path: "${targetTitlePath}", value: textPayload }])`, () => doc.patch([{ op: "replace", path: targetTitlePath, value: textPayload }]), "Edit card")}>doc.patch</ActionButton>}
          />
          <ApiRow action={<ActionButton onClick={() => run(`doc.commit([{ op: "replace", path: "${targetTitlePath}", value }], { selection })`, commitReplaceTitle, "Edit card")}>doc.commit</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run('doc.patch([{ op: "replace", path: "/lists/0/cards/0/points", value: badPoints }])', invalidPatch, "Edit card")}>invalid patch</ActionButton>} />
        </FeaturePanel>

        <FeaturePanel
          title="Move card"
          api="canMove -> patch(move)"
          code={['doc.canMove(source, target)', 'doc.patch({ op: "move", from: source, path: target })']}
          result={featureResult("Move card")}
          meta={[`from ${valueTarget}`, `to ${insertTarget}`, `can ${capabilityStatus(canMoveTarget)}`, "types JSONCapabilityResult"]}
        >
          <ApiRow
            action={<ActionButton onClick={() => run(`doc.canMove("${valueTarget}", "${insertTarget}")`, () => canMoveTarget, "Move card")}>doc.canMove</ActionButton>}
            can={<ActionButton disabledReason={canDisabledReason(canMoveTarget)} onClick={() => run(`doc.patch({ op: "move", from: "${valueTarget}", path: "${insertTarget}" })`, () => doc.patch({ op: "move", from: valueTarget, path: insertTarget }), "Move card")}>doc.patch move</ActionButton>}
          />
        </FeaturePanel>

        <FeaturePanel
          title="Duplicate card"
          api="canDuplicate -> duplicate"
          code={["doc.canDuplicate(source, { rekey })", "doc.duplicate(source, { rekey })"]}
          result={featureResult("Duplicate card")}
          meta={[`source ${valueTarget}`, "rekey id:suffix", `can ${capabilityStatus(canDuplicateTarget)}`, "types JSONDocumentDuplicateResult"]}
        >
          <ApiRow
            action={<ActionButton onClick={() => run(`doc.canDuplicate("${valueTarget}", { rekey })`, () => canDuplicateTarget, "Duplicate card")}>doc.canDuplicate</ActionButton>}
            can={<ActionButton disabledReason={canDisabledReason(canDuplicateTarget)} onClick={() => run(`doc.duplicate("${valueTarget}", { rekey })`, duplicateTarget, "Duplicate card")}>doc.duplicate</ActionButton>}
          />
        </FeaturePanel>

        <FeaturePanel
          title="Find and select"
          api="canFind -> query -> selection.selectRanges"
          code={["doc.canFind(jsonpath)", "doc.query(jsonpath); doc.selection?.selectRanges(pointers)"]}
          result={featureResult("Find and select")}
          meta={[`query ${query}`, `selected ${selectedPointers.length}`, "types QueryResult / SelectionRange"]}
        >
          <ApiRow
            action={<ActionButton onClick={() => run(`doc.canFind(${JSON.stringify(query)})`, () => doc.canFind(query), "Find and select")}>doc.canFind</ActionButton>}
            can={<ActionButton onClick={() => run(`doc.query(${JSON.stringify(query)})`, queryPointers, "Find and select")}>doc.query</ActionButton>}
          />
          <ApiRow action={<ActionButton onClick={() => run("doc.selection?.selectRanges(todoPointers)", selectTodoCards, "Find and select")}>selection.selectRanges</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run(`doc.selection?.collapse("${valueTarget}")`, () => { doc.selection?.collapse(valueTarget); return doc.selection?.snapshot(); }, "Find and select")}>selection.collapse</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run(`doc.selection?.togglePointer("${valueTarget}")`, () => { doc.selection?.togglePointer(valueTarget); return doc.selection?.snapshot(); }, "Find and select")}>selection.togglePointer</ActionButton>} />
        </FeaturePanel>

        <FeaturePanel
          title="Copy and paste"
          api="canCopy -> copy -> canPaste -> paste"
          code={["doc.clipboard.copy(source)", "doc.clipboard.paste(insertTarget, { spread, rekey })", "doc.clipboard.paste({ after: valueTarget })"]}
          result={featureResult("Copy and paste")}
          meta={[
            `source ${primarySource}`,
            `target ${insertTarget}`,
            `clipboard ${hasClipboard ? "set" : "empty"}`,
            "types ClipboardState / PasteTarget",
          ]}
        >
          <ApiRow
            action={<ActionButton onClick={() => run(`doc.canCopy("${primarySource}")`, () => canCopyPrimary, "Copy and paste")}>doc.canCopy</ActionButton>}
            can={<ActionButton disabledReason={canDisabledReason(canCopyPrimary)} onClick={() => run(`doc.clipboard.copy("${primarySource}")`, copyPrimaryCard, "Copy and paste")}>clipboard.copy</ActionButton>}
          />
          <ApiRow
            action={<ActionButton onClick={() => run(`doc.canPaste("${insertTarget}", { spread: true, rekey })`, () => canPasteClipboardToInsertTarget, "Copy and paste")}>doc.canPaste</ActionButton>}
            can={<ActionButton disabledReason={canDisabledReason(canPasteClipboardToInsertTarget)} onClick={() => run(`doc.clipboard.paste("${insertTarget}", { spread: true, rekey })`, pasteClipboardToInsertTarget, "Copy and paste")}>clipboard.paste</ActionButton>}
          />
          <ApiRow
            action={<ActionButton onClick={() => run(`doc.canPaste({ after: "${valueTarget}" })`, () => canPasteClipboardAfterTarget, "Copy and paste")}>doc.canPaste after</ActionButton>}
            can={<ActionButton disabledReason={canDisabledReason(canPasteClipboardAfterTarget)} onClick={() => run(`doc.clipboard.paste({ after: "${valueTarget}" })`, pasteClipboardAfterTarget, "Copy and paste")}>clipboard.paste after</ActionButton>}
          />
          <ApiRow
            action={<ActionButton onClick={() => run(`doc.canPastePayload("${insertTarget}", payload, { rekey })`, () => canPastePayloadToInsertTarget, "Copy and paste")}>doc.canPastePayload</ActionButton>}
            can={<ActionButton disabledReason={canDisabledReason(canPastePayloadToInsertTarget)} onClick={() => run(`doc.clipboard.pastePayload("${insertTarget}", payload, { rekey })`, pastePayloadToInsertTarget, "Copy and paste")}>pastePayload</ActionButton>}
          />
        </FeaturePanel>

        <FeaturePanel
          title="Bulk cards"
          api="selection -> canRemove/canCut -> patch/cut"
          code={["doc.canRemove(selection.selectedSource)", "doc.clipboard.cut(selection.selectedSource)"]}
          result={featureResult("Bulk cards")}
          meta={[`source ${selectedLabel(Array.isArray(selectedSource) ? selectedSource : [selectedSource])}`, `canRemove ${capabilityStatus(canRemoveSource)}`, "types SelectionSource / ClipboardCutResult"]}
        >
          <ApiRow
            action={<ActionButton onClick={() => run("doc.canRemove(source)", () => canRemoveSource, "Bulk cards")}>doc.canRemove</ActionButton>}
            can={<ActionButton disabledReason={canDisabledReason(canRemoveSource)} onClick={() => run("doc.patch(selectedPointers.map((path) => ({ op: \"remove\", path })))", removeTargets, "Bulk cards")}>remove selected</ActionButton>}
          />
          <ApiRow
            action={<ActionButton onClick={() => run("doc.canCut(source)", () => canCutSource, "Bulk cards")}>doc.canCut</ActionButton>}
            can={<ActionButton disabledReason={canDisabledReason(canCutSource)} onClick={() => run("doc.clipboard.cut(source)", () => doc.clipboard.cut(selectedSource), "Bulk cards")}>clipboard.cut</ActionButton>}
          />
        </FeaturePanel>

        <FeaturePanel
          title="Undo and redo"
          api="canUndo/canRedo -> history"
          code={["doc.canUndo(); doc.history.undo()", "doc.canRedo(); doc.history.redo()"]}
          result={featureResult("Undo and redo")}
          meta={[`undo ${doc.history.undoDepth}`, `redo ${doc.history.redoDepth}`, "types JSONDocumentHistory"]}
        >
          <ApiRow
            action={<ActionButton onClick={() => run("doc.canUndo()", () => doc.canUndo(), "Undo and redo")}>doc.canUndo</ActionButton>}
            can={<ActionButton onClick={() => run("doc.history.undo()", () => doc.history.undo(), "Undo and redo")} disabledReason={canDisabledReason(doc.canUndo())}>history.undo</ActionButton>}
          />
          <ApiRow
            action={<ActionButton onClick={() => run("doc.canRedo()", () => doc.canRedo(), "Undo and redo")}>doc.canRedo</ActionButton>}
            can={<ActionButton onClick={() => run("doc.history.redo()", () => doc.history.redo(), "Undo and redo")} disabledReason={canDisabledReason(doc.canRedo())}>history.redo</ActionButton>}
          />
          <ApiRow action={<ActionButton onClick={() => run("doc.history.transaction(options, fn)", transactionRename, "Undo and redo")}>history.transaction</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run('doc.history.mergeLast({ mergeKey: "manual" })', () => doc.history.mergeLast({ mergeKey: "manual" }), "Undo and redo")}>history.mergeLast</ActionButton>} />
        </FeaturePanel>

        <FeaturePanel
          title="Read schema"
          api="at/exists/entries/query + schema"
          code={["doc.at(pointer); doc.entries(pointer)", "doc.schema.describe(pointer, mode)"]}
          result={featureResult("Read schema")}
          meta={[`value ${valueTarget}`, `insert ${insertTarget}`, "types ReadResult / SchemaDescription"]}
        >
          <ApiRow action={<ActionButton onClick={() => run(`doc.at("${valueTarget}")`, () => doc.at(valueTarget), "Read schema")}>doc.at</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run(`doc.exists("${valueTarget}")`, () => doc.exists(valueTarget), "Read schema")}>doc.exists</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run('doc.entries("/lists/0/cards")', () => doc.entries("/lists/0/cards" as Pointer), "Read schema")}>doc.entries</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run(`doc.schema.describe("${insertTarget}", "insert")`, () => doc.schema.describe(insertTarget, "insert"), "Read schema")}>schema.describe</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run(`doc.schema.accepts("${insertTarget}", invalidCard, "insert")`, () => doc.schema.accepts(insertTarget, invalidCard, "insert"), "Read schema")}>schema.accepts invalid</ActionButton>} />
        </FeaturePanel>

        <FeaturePanel
          title="Board plumbing"
          api="public API behind board integrations"
          code={["doc.load/reset/subscribe", "applyPatch + trackPointer + clipboard.write + textPatch"]}
          result={featureResult("Board plumbing")}
          meta={["import/export", "external patches", "subscription", "text edit", "types Pointer / JSONChangeMetadata"]}
        >
          <ApiSectionLabel>Import and reset</ApiSectionLabel>
          <ApiRow action={<ActionButton onClick={() => run("doc.load(nextBoard)", loadFixture, "Board plumbing")}>doc.load</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("doc.reset()", resetBoard, "Board plumbing")}>doc.reset</ActionButton>} />
          <ApiSectionLabel>External patch sync</ApiSectionLabel>
          <ApiRow action={<ActionButton onClick={() => run("doc.subscribe(listener)", inspectSubscribe, "Board plumbing")}>doc.subscribe</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("applyPatch(schema, board, patch)", inspectApplyPatch, "Board plumbing")}>applyPatch</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("trackPointer(pointer, patch)", inspectTrackPointer, "Board plumbing")}>trackPointer</ActionButton>} />
          <ApiSectionLabel>Path helpers</ApiSectionLabel>
          <ApiRow action={<ActionButton onClick={() => run("pointer helpers", inspectPointerHelpers, "Board plumbing")}>pointer helpers</ActionButton>} />
          <ApiSectionLabel>Clipboard and text</ApiSectionLabel>
          <ApiRow action={<ActionButton onClick={() => run(`doc.clipboard.write(payload, { source: "${valueTarget}" })`, () => { doc.clipboard.write(parsedPayload(), { source: valueTarget }); return doc.clipboard.read(); }, "Board plumbing")}>clipboard.write</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("doc.clipboard.clear()", () => { doc.clipboard.clear(); return { cleared: true, hasData: doc.clipboard.hasData }; }, "Board plumbing")}>clipboard.clear</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("doc.selection?.textPatch(textPayload)", replaceTitleText, "Board plumbing")}>selection.textPatch</ActionButton>} />
          <ApiSectionLabel>Schema probe</ApiSectionLabel>
          <ApiRow action={<ActionButton onClick={() => run(`doc.schema.kind("${valueTarget}")`, () => doc.schema.kind(valueTarget), "Board plumbing")}>schema.kind</ActionButton>} />
        </FeaturePanel>
      </section>

      <section className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
        <ActionGroup title="root API">
          <ApiRow action={<ActionButton onClick={() => run("JSONCrudError / PointerSyntaxError", inspectBoundaryErrors)}>JSONCrudError</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("PointerSyntaxError", inspectBoundaryErrors)}>PointerSyntaxError</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("createJSONDocument(schema, value, options)", inspectCreateJSONDocument)}>createJSONDocument</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("applyOperation(schema, state, operation)", inspectApplyOperation)}>applyOperation</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("applyPatch(schema, state, patch)", inspectApplyPatch)}>applyPatch</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("applyPatchToTrustedState(schema, state, patch)", inspectApplyPatchToTrustedState)}>applyPatchToTrustedState</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run('parsePointer("/lists/0/cards/0")', () => parsePointer("/lists/0/cards/0"))}>parsePointer</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run('tryParsePointer("/lists/0/cards/0")', () => tryParsePointer("/lists/0/cards/0"))}>tryParsePointer</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run('buildPointer(["lists", 0, "cards", 0])', () => buildPointer(["lists", 0, "cards", 0]))}>buildPointer</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run('escapeSegment("a/b~c")', () => escapeSegment("a/b~c"))}>escapeSegment</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run('unescapeSegment("a~1b~0c")', () => unescapeSegment("a~1b~0c"))}>unescapeSegment</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run('parentPointer("/lists/0/cards/0/title")', () => parentPointer("/lists/0/cards/0/title"))}>parentPointer</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run('lastSegment("/lists/0/cards/0/title")', () => lastSegment("/lists/0/cards/0/title"))}>lastSegment</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run('lastSegmentIndex("/lists/0/cards/12")', () => lastSegmentIndex("/lists/0/cards/12"))}>lastSegmentIndex</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run('appendSegment("/lists/0/cards", 0)', () => appendSegment("/lists/0/cards", 0))}>appendSegment</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run('withLastSegment("/lists/0/cards/0/title", "points")', () => withLastSegment("/lists/0/cards/0/title", "points"))}>withLastSegment</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("trackPointer(pointer, patch)", inspectTrackPointer)}>trackPointer</ActionButton>} />
        </ActionGroup>

        <ActionGroup title="react API">
          <ApiRow action={<ActionButton onClick={() => run("useJSONDocument(schema, value, options)", inspectReactFacade)}>useJSONDocument</ActionButton>} />
        </ActionGroup>

        <ActionGroup title="document API">
          <ApiRow action={<ActionButton onClick={() => run("doc.value", () => doc.value)}>doc.value</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("doc.lastPatch", () => doc.lastPatch)}>doc.lastPatch</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("doc.selection", () => doc.selection?.snapshot())}>doc.selection</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("doc.history", () => ({ canUndo: doc.history.canUndo, canRedo: doc.history.canRedo, undoDepth: doc.history.undoDepth, redoDepth: doc.history.redoDepth }))}>doc.history</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("doc.clipboard", () => doc.clipboard.read())}>doc.clipboard</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("doc.schema", () => doc.schema.at(valueTarget))}>doc.schema</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run('doc.patch([{ op: "add", path, value }])', addCardToTodo)}>doc.patch</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("doc.commit(patch, options)", commitReplaceTitle)}>doc.commit</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run(`doc.duplicate("${valueTarget}", { rekey })`, duplicateTarget)}>doc.duplicate</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("doc.load(nextValue)", loadFixture)}>doc.load</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("doc.reset()", resetBoard)}>doc.reset</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("doc.subscribe(listener)", inspectSubscribe)}>doc.subscribe</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run(`doc.at("${valueTarget}")`, () => doc.at(valueTarget))}>doc.at</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run(`doc.exists("${valueTarget}")`, () => doc.exists(valueTarget))}>doc.exists</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run(`doc.query(${JSON.stringify(query)})`, queryPointers)}>doc.query</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run('doc.entries("/lists/0/cards")', () => doc.entries("/lists/0/cards" as Pointer))}>doc.entries</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("doc.canPatch(patch)", () => canPatchReplaceTitle)}>doc.canPatch</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run(`doc.canFind(${JSON.stringify(query)})`, () => doc.canFind(query))}>doc.canFind</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run(`doc.canReplace("${targetPointsPath}", pointsPayload)`, () => doc.canReplace(targetPointsPath, pointsValue))}>doc.canReplace</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("doc.canRemove(source)", () => doc.canRemove(selectedSource))}>doc.canRemove</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run(`doc.canMove("${valueTarget}", "${insertTarget}")`, () => doc.canMove(valueTarget, insertTarget))}>doc.canMove</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run(`doc.canDuplicate("${valueTarget}", { rekey })`, () => doc.canDuplicate(valueTarget, { rekey: cardRekey() }))}>doc.canDuplicate</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("doc.canCopy(source)", () => doc.canCopy(selectedSource))}>doc.canCopy</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("doc.canCut(source)", () => doc.canCut(selectedSource))}>doc.canCut</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run(`doc.canPaste("${insertTarget}", { spread: true, rekey })`, () => doc.canPaste(insertTarget, { spread: true, rekey: cardRekey() }))}>doc.canPaste</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run(`doc.canPastePayload("${insertTarget}", payload)`, () => doc.canPastePayload(insertTarget, parsedPayload()))}>doc.canPastePayload</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("doc.canUndo()", () => doc.canUndo())}>doc.canUndo</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("doc.canRedo()", () => doc.canRedo())}>doc.canRedo</ActionButton>} />
        </ActionGroup>

        <ActionGroup title="selection API">
          <ApiRow action={<ActionButton onClick={() => run("selection read properties", inspectSelectionReads)}>selection properties</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run(`doc.selection?.collapse("${valueTarget}")`, () => { doc.selection?.collapse(valueTarget); return doc.selection?.snapshot(); })}>selection.collapse</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run(`doc.selection?.setBaseAndExtent("${cardPointer(0, 0)}", "${valueTarget}")`, () => { doc.selection?.setBaseAndExtent(cardPointer(0, 0), valueTarget); return doc.selection?.snapshot(); })}>selection.setBaseAndExtent</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run(`doc.selection?.extend("${valueTarget}")`, () => { doc.selection?.extend(valueTarget); return doc.selection?.snapshot(); })}>selection.extend</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run(`doc.selection?.addRange("${valueTarget}")`, () => { doc.selection?.addRange(valueTarget); return doc.selection?.snapshot(); })}>selection.addRange</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("doc.selection?.removeRange(0)", () => { doc.selection?.removeRange(0); return doc.selection?.snapshot(); })}>selection.removeRange</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run(`doc.selection?.toggleRange("${valueTarget}")`, () => { doc.selection?.toggleRange(valueTarget); return doc.selection?.snapshot(); })}>selection.toggleRange</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run(`doc.selection?.togglePointer("${valueTarget}")`, () => { doc.selection?.togglePointer(valueTarget); return doc.selection?.snapshot(); })}>selection.togglePointer</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run('doc.selection?.moveCursor("next")', () => doc.selection?.moveCursor("next"))}>selection.moveCursor</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run('doc.selection?.extendCursor("next")', () => doc.selection?.extendCursor("next"))}>selection.extendCursor</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run('doc.selection?.resolveCursor("next")', () => doc.selection?.resolveCursor("next"))}>selection.resolveCursor</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("doc.selection?.orderPrimaryRange()", () => doc.selection?.orderPrimaryRange())}>selection.orderPrimaryRange</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("doc.selection?.orderRanges()", () => doc.selection?.orderRanges())}>selection.orderRanges</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run(`doc.selection?.spansForPointer("${valueTarget}")`, () => doc.selection?.spansForPointer(valueTarget))}>selection.spansForPointer</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("doc.selection?.textEdits(textPayload)", () => doc.selection?.textEdits(textPayload))}>selection.textEdits</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("doc.selection?.textPatch(textPayload)", replaceTitleText)}>selection.textPatch</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("doc.selection?.deleteText()", () => doc.selection?.deleteText())}>selection.deleteText</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run('doc.selection?.selectScope({ scope: "/lists/0/cards" })', () => doc.selection?.selectScope({ scope: "/lists/0/cards" }))}>selection.selectScope</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run('doc.selection?.resolveScope({ scope: "/lists/0/cards" })', () => doc.selection?.resolveScope({ scope: "/lists/0/cards" }))}>selection.resolveScope</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("doc.selection?.selectRanges(todoPointers)", selectTodoCards)}>selection.selectRanges</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run('doc.selection?.setContext({ feature: "kanban" })', () => { doc.selection?.setContext({ feature: "kanban" }); return doc.selection?.snapshot(); })}>selection.setContext</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("doc.selection?.clearContext()", () => { doc.selection?.clearContext(); return doc.selection?.snapshot(); })}>selection.clearContext</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("doc.selection?.empty()", () => { doc.selection?.empty(); return doc.selection?.snapshot(); })}>selection.empty</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run(`doc.selection?.isSelected("${valueTarget}")`, () => doc.selection?.isSelected(valueTarget))}>selection.isSelected</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("doc.selection?.snapshot()", () => doc.selection?.snapshot())}>selection.snapshot</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("doc.selection?.toJSON()", () => doc.selection?.toJSON())}>selection.toJSON</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("doc.selection?.restore(snapshot)", selectionRestoreRoundtrip)}>selection.restore</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("doc.selection?.subscribe(listener)", selectionSubscribeOnce)}>selection.subscribe</ActionButton>} />
        </ActionGroup>

        <ActionGroup title="clipboard API">
          <ApiRow action={<ActionButton onClick={() => run("doc.clipboard.hasData", () => doc.clipboard.hasData)}>clipboard.hasData</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("doc.clipboard.source", () => doc.clipboard.source)}>clipboard.source</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("doc.clipboard.sources", () => doc.clipboard.sources)}>clipboard.sources</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("doc.clipboard.read()", () => doc.clipboard.read())}>clipboard.read</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run(`doc.clipboard.write(payload, { source: "${valueTarget}" })`, () => { doc.clipboard.write(parsedPayload(), { source: valueTarget }); return doc.clipboard.read(); })}>clipboard.write</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("doc.clipboard.clear()", () => { doc.clipboard.clear(); return { cleared: true, hasData: doc.clipboard.hasData }; })}>clipboard.clear</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("doc.clipboard.copy(source)", copySelection)}>clipboard.copy</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("doc.clipboard.cut(source)", () => doc.clipboard.cut(selectedSource))}>clipboard.cut</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run(`doc.clipboard.paste("${insertTarget}", { spread: true, rekey })`, pasteClipboardToInsertTarget)}>clipboard.paste</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run(`doc.clipboard.pastePayload("${insertTarget}", payload, { rekey })`, pastePayloadToInsertTarget)}>clipboard.pastePayload</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run(`doc.clipboard.paste({ after: "${valueTarget}" })`, pasteClipboardAfterTarget)}>clipboard.paste after</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run(`doc.clipboard.pastePayload({ after: "${valueTarget}" }, payload, { rekey })`, pastePayloadAfterTarget)}>clipboard.pastePayload after</ActionButton>} />
        </ActionGroup>

        <ActionGroup title="history API">
          <ApiRow action={<ActionButton onClick={() => run("doc.history.canUndo", () => doc.history.canUndo)}>history.canUndo</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("doc.history.canRedo", () => doc.history.canRedo)}>history.canRedo</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("doc.history.undoDepth", () => doc.history.undoDepth)}>history.undoDepth</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("doc.history.redoDepth", () => doc.history.redoDepth)}>history.redoDepth</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("doc.history.undo()", () => doc.history.undo())}>history.undo</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("doc.history.redo()", () => doc.history.redo())}>history.redo</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run('doc.history.mergeLast({ mergeKey: "manual" })', () => doc.history.mergeLast({ mergeKey: "manual" }))}>history.mergeLast</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("doc.history.transaction(options, fn)", transactionRename)}>history.transaction</ActionButton>} />
        </ActionGroup>

        <ActionGroup title="schema API">
          <ApiRow action={<ActionButton onClick={() => run(`doc.schema.at("${valueTarget}")`, () => doc.schema.at(valueTarget))}>schema.at</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run(`doc.schema.kind("${valueTarget}")`, () => doc.schema.kind(valueTarget))}>schema.kind</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run(`doc.schema.accepts("${insertTarget}", payload, "insert")`, () => doc.schema.accepts(insertTarget, parsedPayload(), "insert"))}>schema.accepts</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run(`doc.schema.accepts("${insertTarget}", invalidCard, "insert")`, () => doc.schema.accepts(insertTarget, invalidCard, "insert"))}>schema.accepts invalid</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run(`doc.schema.describe("${insertTarget}", "insert")`, () => doc.schema.describe(insertTarget, "insert"))}>schema.describe</ActionButton>} />
        </ActionGroup>

        <ActionGroup title="type API">
          <ApiTokenGroups groups={publicTypeGroups} fallbackItems={publicTypeExports} />
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

function FeaturePanel(props: {
  title: string;
  api: string;
  meta: readonly string[];
  code?: readonly string[];
  result?: BenchResult;
  children: ReactNode;
}) {
  return (
    <div data-api-group="" className="rounded border border-stone-200 bg-white p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="m-0 text-xs font-semibold uppercase tracking-wide text-stone-500">{props.title}</h2>
        <code className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-600">{props.api}</code>
      </div>
      <div className="mb-2 flex flex-wrap gap-1">
        {props.meta.map((item) => (
          <span key={item} className="rounded bg-stone-50 px-1.5 py-0.5 text-[10px] text-stone-500">{item}</span>
        ))}
      </div>
      {props.code ? (
        <div className="mb-2 grid gap-1">
          {props.code.map((item) => (
            <code key={item} className="overflow-hidden text-ellipsis whitespace-nowrap rounded bg-stone-950 px-2 py-1 text-[10px] text-stone-100">{item}</code>
          ))}
        </div>
      ) : null}
      <div className="grid gap-1.5">{props.children}</div>
      {props.result ? (
        <div className="mt-2 rounded border border-stone-200 bg-stone-50 p-2 text-[10px] text-stone-700">
          <div className="mb-1 truncate font-mono text-stone-950">{props.result.call}</div>
          {props.result.bindings && props.result.bindings.length > 0 ? (
            <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-stone-400">Clicked with</div>
          ) : null}
          <div className="mb-1 flex flex-wrap gap-1">
            {props.result.bindings?.map((item) => (
              <span key={item} className="rounded bg-sky-50 px-1.5 py-0.5 text-sky-700">{item}</span>
            ))}
            {props.result.effect?.map((item) => (
              <span key={item} className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700">{item}</span>
            ))}
            {resultSummary(props.result.value, props.result.call).map((item) => (
              <span key={item} className="rounded bg-white px-1.5 py-0.5">{item}</span>
            ))}
          </div>
          <details>
            <summary className="cursor-pointer text-stone-500">raw</summary>
            <pre className="mt-1 max-h-36 overflow-auto whitespace-pre-wrap leading-relaxed">{stringify(props.result.value)}</pre>
          </details>
        </div>
      ) : null}
    </div>
  );
}

function ActionGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div data-api-group="" className="rounded border border-stone-200 bg-white p-3">
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

function ApiSectionLabel({ children }: { children: ReactNode }) {
  return <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-stone-400 first:mt-0">{children}</div>;
}

function ApiTokenGroups(props: {
  groups: readonly { label: string; note: string; items: readonly string[] }[];
  fallbackItems: readonly string[];
}) {
  const grouped = new Set(props.groups.flatMap((group) => group.items));
  const leftovers = props.fallbackItems.filter((item) => !grouped.has(item));
  const groups = leftovers.length > 0
    ? [...props.groups, { label: "Other exported contracts", note: "shared helper contracts", items: leftovers }]
    : props.groups;
  return (
    <div className="grid max-h-96 gap-3 overflow-auto">
      {groups.map((group) => (
        <div key={group.label}>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-stone-400">{group.label}</div>
          <div className="mb-1 text-[10px] text-stone-500">{group.note}</div>
          <ApiTokenList items={group.items} />
        </div>
      ))}
    </div>
  );
}

function ApiTokenList({ items }: { items: readonly string[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((item) => (
        <code key={item} className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-600">{item}</code>
      ))}
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
        <>
          {" "}
          <span aria-hidden="true" className="rounded bg-stone-100 px-1 text-[10px] uppercase text-stone-500">
            {props.disabledMark ?? disabledMark(props.disabledReason)}
          </span>
        </>
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
