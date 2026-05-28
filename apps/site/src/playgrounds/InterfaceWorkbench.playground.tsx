import { useEffect, useMemo, useState, type ReactNode } from "react";
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
  type SelectionSnap,
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
type FeatureStageId =
  | "board-setup"
  | "card-intake"
  | "card-edit"
  | "flow-columns"
  | "selection-bulk"
  | "clipboard-reuse"
  | "find-filter"
  | "recovery-history"
  | "integration";

type FeatureStage = {
  id: FeatureStageId;
  title: string;
  apis: readonly string[];
};

const featureStages: readonly FeatureStage[] = [
  { id: "board-setup", title: "Board setup", apis: ["useJSONDocument", "createJSONDocument", "doc.load", "doc.reset", "doc.subscribe"] },
  { id: "card-intake", title: "Card intake", apis: ["schema.accepts", "schema.describe", "canInsert", "insert"] },
  { id: "card-edit", title: "Card edit", apis: ["at", "exists", "schema.kind", "canReplace", "replace", "commit", "canDelete", "delete"] },
  { id: "flow-columns", title: "Flow across columns", apis: ["canMove", "move", "canDuplicate", "duplicate"] },
  { id: "selection-bulk", title: "Selection and bulk work", apis: ["selection.*", "canDelete", "delete"] },
  { id: "clipboard-reuse", title: "Reuse via clipboard", apis: ["clipboard.*", "canCopy", "canCut", "canPaste", "paste"] },
  { id: "find-filter", title: "Find and filter", apis: ["canFind", "find", "selection.selectRanges"] },
  { id: "recovery-history", title: "Recovery and history", apis: ["canUndo", "canRedo", "history.*"] },
  { id: "integration", title: "Integration and helpers", apis: ["applyOperation", "applyPatch", "applyPatchToTrustedState", "trackPointer", "pointer helpers"] },
];

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
  "JSONDocumentDuplicateError",
  "JSONDocumentDuplicateOptions",
  "JSONDocumentDuplicateResult",
  "JSONDocumentHistory",
  "JSONDocumentOptions",
  "JSONDocumentPasteOptions",
  "JSONDocumentPasteTarget",
  "JSONPatchInput",
  "JSONPatchOperation",
  "SelectionPoint",
  "JSONResult",
  "Pointer",
  "ClipboardCopyOptions",
  "ClipboardCopyError",
  "ClipboardCopyOk",
  "ClipboardCopyResult",
  "ClipboardCutError",
  "ClipboardCutOk",
  "ClipboardCutOptions",
  "ClipboardCutResult",
  "ClipboardEmpty",
  "ClipboardMutationOk",
  "ClipboardPasteDiscriminatorMismatch",
  "ClipboardPasteError",
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
  "SelectionOptions",
  "SelectionPointObject",
  "SelectionOrderedRange",
  "SelectionOrderedRangeEntry",
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
    items: publicTypeExports.filter((item) => item.includes("Selection") || item === "SelectionPoint" || item === "SelectionPointObject" || item === "SelectionOrderedRange" || item === "SelectionOrderedRangeEntry"),
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

function collapsedSelection(pointer: Pointer): SelectionSnap {
  return {
    selectedPointers: [pointer],
    selectionRanges: [{ anchor: pointer, focus: pointer }],
    primaryIndex: 0,
    anchor: pointer,
    focus: pointer,
  };
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

function stateStatus(reason: string | undefined): string | undefined {
  if (!reason) return undefined;
  if (reason.startsWith("state: ")) return `state ${reason.slice("state: ".length)}`;
  if (!reason.startsWith("can: ")) return reason;
  const code = reason.slice("can: ".length).split(":")[0]?.trim().split(" ")[0];
  return code ? `can ${code}` : "can blocked";
}

function isEditableShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement;
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
    || call.includes("doc.replace(")
    || call.includes("doc.delete(")
    || call.includes("doc.move(")
    || call.includes("doc.commit(")
    || call.includes("doc.duplicate(")
    || call.includes("doc.cut(")
    || call.includes("doc.paste(")
    || call.includes("doc.undo(")
    || call.includes("doc.redo(")
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
  const [apiCoverageOpen, setApiCoverageOpen] = useState(false);
  const [activeStageId, setActiveStageId] = useState<FeatureStageId>("board-setup");

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
  const canInsertPayload = doc.canInsert(insertTarget, payloadValue);
  const canPatchReplaceTitle = doc.canPatch([{ op: "replace", path: targetTitlePath, value: textPayload }]);
  const canPatchReplacePoints = doc.canPatch([{ op: "replace", path: targetPointsPath, value: pointsValue }]);
  const canPatchBadPoints = doc.canPatch([{ op: "replace", path: targetPointsPath, value: badPointsValue }]);
  const canPatchDeleteTarget = doc.canPatch([{ op: "remove", path: valueTarget }]);
  const canDuplicateTarget = doc.canDuplicate(valueTarget, { rekey: cardRekey() });
  const canMoveTarget = doc.canMove(valueTarget, insertTarget);
  const canReplaceTargetTitle = doc.canReplace(targetTitlePath, textPayload);
  const canDeleteSource = doc.canDelete(selectedSource);
  const canCopySource = doc.canCopy(selectedSource);
  const canCopyPrimary = doc.canCopy(primarySource);
  const canCutSource = doc.canCut(selectedSource);
  const canPasteClipboardAfterTarget = doc.canPaste({ after: valueTarget });
  const canPasteClipboardToInsertTarget = doc.canPaste(insertTarget, { spread: true, rekey: cardRekey() });
  const canPasteDirectPayloadToInsertTarget = doc.canPaste(insertTarget, { payload: payloadValue, rekey: cardRekey() });
  const canFindQuery = doc.canFind(query);
  const canUndo = doc.canUndo();
  const canRedo = doc.canRedo();
  const selectedCount = selectedPointers.length;
  const activeStage = featureStages.find((stage) => stage.id === activeStageId) ?? featureStages[0]!;
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
    if (feature === "Insert card") {
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

  const insertCardToTodo = (): unknown => doc.insert(insertTarget, parsedPayload());

  const copySelection = (): unknown => doc.copy(selectedSource);

  const copyPrimaryCard = (): unknown => doc.copy(primarySource);

  const pasteClipboardAfterTarget = (): unknown => doc.paste({ after: valueTarget });

  const pasteClipboardToInsertTarget = (): unknown => doc.paste(insertTarget, {
    spread: true,
    rekey: cardRekey(),
  });

  const pasteDirectPayloadAfterTarget = (): unknown => doc.paste(
    { after: valueTarget },
    { payload: parsedPayload(), rekey: cardRekey() },
  );

  const pasteDirectPayloadToInsertTarget = (): unknown => doc.paste(
    insertTarget,
    { payload: parsedPayload(), rekey: cardRekey() },
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
    const matches = doc.find(query);
    if (!matches.ok) return matches;
    doc.selection?.selectRanges(matches.pointers, undefined, undefined, Math.max(0, matches.pointers.length - 1));
    return matches;
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
      { label: "commit", selection: collapsedSelection(valueTarget) },
    );
  };

  const transactionRename = (): unknown => {
    doc.history.transaction({ label: "rename-two" }, () => {
      doc.patch({ op: "replace", path: "/lists/0/cards/0/title", value: "Batch A" });
      doc.patch({ op: "replace", path: "/lists/0/cards/1/title", value: "Batch B" });
    });
    return doc.value;
  };

  const queryPointers = (): unknown => doc.find(query);

  const inspectCreateJSONDocument = (): unknown => {
    const headless = createJSONDocument(BoardSchema, initialBoard, {
      history: 10,
      selection: { mode: "extended", initial: [cardPointer(0, 0)] },
    });
    headless.patch({ op: "copy", from: cardPointer(0, 0), path: "/lists/0/cards/-" });
    headless.selection?.togglePointer(cardPointer(0, 1));
    headless.copy(headless.selection?.selectedPointers ?? []);
    headless.paste("/lists/1/cards/-");

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
  const deleteTarget = (): unknown => doc.delete(valueTarget);
  const deleteTargets = (): unknown => doc.delete(selectedSource);

  const executeInsertCard = (): void => {
    const disabled = canDisabledReason(canInsertPayload);
    if (disabled) return;
    run(`doc.insert("${insertTarget}", payload)`, insertCardToTodo, "Insert card");
  };

  const executeSelectNone = (): void => {
    run("doc.selection?.empty()", selectNoCards, "Selection set");
  };

  const executeSelectOne = (): void => {
    run(`doc.selection?.collapse("${cardPointer(0, 0)}")`, selectFirstCard, "Selection set");
  };

  const executeSelectMany = (): void => {
    run("doc.selection?.selectRanges(queryPointers)", selectTodoCards, "Selection set");
  };

  const executeSelectSearchResults = (): void => {
    const disabled = canDisabledReason(canFindQuery);
    if (disabled) return;
    run("doc.selection?.selectRanges(queryPointers)", selectTodoCards, "Find and select");
  };

  const executeUndo = (): void => {
    const disabled = canDisabledReason(canUndo);
    if (disabled) return;
    run("doc.undo()", () => doc.undo(), "Undo and redo");
  };

  const executeRedo = (): void => {
    const disabled = canDisabledReason(canRedo);
    if (disabled) return;
    run("doc.redo()", () => doc.redo(), "Undo and redo");
  };

  const executeRenameCard = (): void => {
    const disabled = selectedCardReason ?? canDisabledReason(canPatchReplaceTitle);
    if (disabled) return;
    run(`doc.replace("${targetTitlePath}", textPayload)`, () => doc.replace(targetTitlePath, textPayload), "Edit card");
  };

  const executeMoveCard = (): void => {
    const disabled = selectedCardReason ?? canDisabledReason(canMoveTarget);
    if (disabled) return;
    run(`doc.move("${valueTarget}", "${insertTarget}")`, () => doc.move(valueTarget, insertTarget), "Move card");
  };

  const executeDuplicateCard = (): void => {
    const disabled = selectedCardReason ?? canDisabledReason(canDuplicateTarget);
    if (disabled) return;
    run(`doc.duplicate("${valueTarget}", { rekey })`, duplicateTarget, "Duplicate card");
  };

  const executeCopyCommand = (): void => {
    if (selectedCount > 1) {
      const disabled = bulkSelectionReason ?? canDisabledReason(canCopySource);
      if (disabled) return;
      run("doc.copy(source)", copySelection, "Bulk cards");
      return;
    }
    const disabled = selectedCardReason ?? canDisabledReason(canCopyPrimary);
    if (disabled) return;
    run(`doc.copy("${primarySource}")`, copyPrimaryCard, "Copy and paste");
  };

  const executeCutCommand = (): void => {
    const disabled = selectedCount > 1
      ? bulkSelectionReason ?? canDisabledReason(canCutSource)
      : selectedCardReason ?? canDisabledReason(canCutSource);
    if (disabled) return;
    run("doc.cut(source)", () => doc.cut(selectedSource), selectedCount > 1 ? "Bulk cards" : "Copy and paste");
  };

  const executePasteCommand = (): void => {
    if (selectedCount > 1) {
      const disabled = bulkSelectionReason ?? canDisabledReason(canPasteClipboardToInsertTarget);
      if (disabled) return;
      run(`doc.paste("${insertTarget}", { spread: true, rekey })`, pasteClipboardToInsertTarget, "Bulk cards");
      return;
    }
    const disabled = selectedCardReason ?? canDisabledReason(canPasteClipboardAfterTarget);
    if (disabled) return;
    run(`doc.paste({ after: "${valueTarget}" })`, pasteClipboardAfterTarget, "Copy and paste");
  };

  const executeDeleteCommand = (): void => {
    if (selectedCount > 1) {
      const disabled = bulkSelectionReason ?? canDisabledReason(canDeleteSource);
      if (disabled) return;
      run("doc.delete(source)", deleteTargets, "Bulk cards");
      return;
    }
    const disabled = selectedCardReason ?? canDisabledReason(canPatchDeleteTarget);
    if (disabled) return;
    run(`doc.delete("${valueTarget}")`, deleteTarget, "Delete card");
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.repeat || isEditableShortcutTarget(event.target)) return;

      const key = event.key.toLowerCase();
      const mod = event.metaKey || event.ctrlKey;
      if (mod && !event.altKey && key === "z") {
        event.preventDefault();
        if (event.shiftKey) executeRedo();
        else executeUndo();
        return;
      }
      if (mod && !event.altKey && key === "y") {
        event.preventDefault();
        executeRedo();
        return;
      }
      if (mod || event.altKey) return;

      if (key === "n") {
        event.preventDefault();
        executeInsertCard();
      } else if (key === "f") {
        event.preventDefault();
        executeSelectSearchResults();
      } else if (key === "e") {
        event.preventDefault();
        executeRenameCard();
      } else if (key === "m") {
        event.preventDefault();
        executeMoveCard();
      } else if (key === "d") {
        event.preventDefault();
        executeDuplicateCard();
      } else if (key === "c") {
        event.preventDefault();
        executeCopyCommand();
      } else if (key === "x") {
        event.preventDefault();
        executeCutCommand();
      } else if (key === "v") {
        event.preventDefault();
        executePasteCommand();
      } else if (key === "delete" || key === "backspace") {
        event.preventDefault();
        executeDeleteCommand();
      } else if (key === "0") {
        event.preventDefault();
        executeSelectNone();
      } else if (key === "1") {
        event.preventDefault();
        executeSelectOne();
      } else if (key === "2") {
        event.preventDefault();
        executeSelectMany();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  const valueTargetInput = (label: string): ReactNode => (
    <CommandArg label={label}>
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
    </CommandArg>
  );

  const insertTargetInput = (label: string): ReactNode => (
    <CommandArg label={label}>
      <select
        value={insertTarget}
        onChange={(event) => changeInsertTarget(event.target.value as Pointer)}
        className="w-full rounded border border-stone-300 bg-white px-2 py-1 text-xs"
      >
        {insertPointers.map((item) => (
          <option key={item.pointer} value={item.pointer}>{item.label}</option>
        ))}
      </select>
    </CommandArg>
  );

  const payloadInput = (label: string): ReactNode => (
    <CommandArg label={label} wide>
      <textarea
        value={payload}
        onChange={(event) => setPayload(event.target.value)}
        className="h-20 w-full resize-none rounded border border-stone-300 px-2 py-1 font-mono text-xs"
        spellCheck={false}
      />
    </CommandArg>
  );

  const queryInput = (label: string): ReactNode => (
    <CommandArg label={label} wide>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className="w-full rounded border border-stone-300 px-2 py-1 font-mono text-xs"
      />
    </CommandArg>
  );

  const textInput = (label: string): ReactNode => (
    <CommandArg label={label}>
      <input
        value={textPayload}
        onChange={(event) => setTextPayload(event.target.value)}
        className="w-full rounded border border-stone-300 px-2 py-1 text-xs"
      />
    </CommandArg>
  );

  const numberInput = (
    label: string,
    value: string,
    onChange: (value: string) => void,
  ): ReactNode => (
    <CommandArg label={label}>
      <input
        type="number"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded border border-stone-300 px-2 py-1 text-xs"
      />
    </CommandArg>
  );

  const stageContent: Record<FeatureStageId, ReactNode> = {
    "board-setup": (
      <>
        <CommandRow title="Create board" api="useJSONDocument / createJSONDocument" result={featureResult("Create board")}>
          <ActionButton onClick={() => run("useJSONDocument(schema, initial, options)", inspectReactFacade, "Create board")}>useJSONDocument</ActionButton>
          <ActionButton onClick={() => run("createJSONDocument(schema, initial, options)", inspectCreateJSONDocument, "Create board")}>createJSONDocument</ActionButton>
        </CommandRow>
        <CommandRow title="Load board" api="doc.load(nextBoard)" result={featureResult("Board plumbing")}>
          <ActionButton onClick={() => run("doc.load(nextBoard)", loadFixture, "Board plumbing")}>Load</ActionButton>
        </CommandRow>
        <CommandRow title="Reset board" api="doc.reset()" result={featureResult("Board plumbing")}>
          <ActionButton onClick={() => run("doc.reset()", resetBoard, "Board plumbing")}>Reset</ActionButton>
        </CommandRow>
        <CommandRow title="Subscribe to patch" api="doc.subscribe(listener)" result={featureResult("Board plumbing")}>
          <ActionButton onClick={() => run("doc.subscribe(listener)", inspectSubscribe, "Board plumbing")}>Subscribe</ActionButton>
        </CommandRow>
      </>
    ),
    "card-intake": (
      <>
        <CommandRow
          title="Insert card"
          api="doc.insert(target, payload)"
          status={<CommandState capability={canInsertPayload} />}
          args={<>{insertTargetInput("insert target")}{payloadInput("insert payload")}</>}
          shortcut="N"
          result={featureResult("Insert card")}
        >
          <ActionButton disabledReason={canDisabledReason(canInsertPayload)} onClick={executeInsertCard}>Insert</ActionButton>
        </CommandRow>
        <CommandRow
          title="Validate card draft"
          api="doc.schema.accepts(insert)"
          args={<>{insertTargetInput("validate target")}{payloadInput("validate payload")}</>}
          result={featureResult("Read schema")}
        >
          <ActionButton onClick={() => run(`doc.schema.accepts("${insertTarget}", payload, "insert")`, () => doc.schema.accepts(insertTarget, parsedPayload(), "insert"), "Read schema")}>Validate</ActionButton>
        </CommandRow>
        <CommandRow
          title="Validate invalid draft"
          api="doc.schema.accepts(insert)"
          args={insertTargetInput("invalid target")}
          result={featureResult("Read schema")}
        >
          <ActionButton onClick={() => run(`doc.schema.accepts("${insertTarget}", invalidCard, "insert")`, () => doc.schema.accepts(insertTarget, invalidCard, "insert"), "Read schema")}>Validate invalid</ActionButton>
        </CommandRow>
        <CommandRow
          title="Describe card slot"
          api="doc.schema.describe(insert)"
          args={insertTargetInput("describe target")}
          result={featureResult("Read schema")}
        >
          <ActionButton onClick={() => run(`doc.schema.describe("${insertTarget}", "insert")`, () => doc.schema.describe(insertTarget, "insert"), "Read schema")}>Describe</ActionButton>
        </CommandRow>
      </>
    ),
    "card-edit": (
      <>
        <CommandRow title="Select card" api="selection.collapse / togglePointer" shortcut="1" result={featureResult("Selection set")}>
          <ActionButton onClick={executeSelectOne}>select 1</ActionButton>
          <ActionButton onClick={() => run(`doc.selection?.togglePointer("${valueTarget}")`, () => { doc.selection?.togglePointer(valueTarget); return doc.selection?.snapshot(); }, "Selection set")}>toggle</ActionButton>
        </CommandRow>
        <CommandRow
          title="Read card"
          api="doc.at(pointer)"
          status={<CommandState reason={selectedCardReason} />}
          args={valueTargetInput("read target")}
          result={featureResult("Read schema")}
        >
          <ActionButton disabledReason={selectedCardReason} onClick={() => run(`doc.at("${valueTarget}")`, () => doc.at(valueTarget), "Read schema")}>Read</ActionButton>
        </CommandRow>
        <CommandRow
          title="Check card exists"
          api="doc.exists(pointer)"
          status={<CommandState reason={selectedCardReason} />}
          args={valueTargetInput("exists target")}
          result={featureResult("Read schema")}
        >
          <ActionButton disabledReason={selectedCardReason} onClick={() => run(`doc.exists("${valueTarget}")`, () => doc.exists(valueTarget), "Read schema")}>Check</ActionButton>
        </CommandRow>
        <CommandRow
          title="Read card schema"
          api="doc.schema.kind(pointer)"
          status={<CommandState reason={selectedCardReason} />}
          args={valueTargetInput("kind target")}
          result={featureResult("Read schema")}
        >
          <ActionButton disabledReason={selectedCardReason} onClick={() => run(`doc.schema.kind("${valueTarget}")`, () => doc.schema.kind(valueTarget), "Read schema")}>Kind</ActionButton>
        </CommandRow>
        <CommandRow
          title="Rename card"
          api="doc.replace(title)"
          status={<CommandState reason={selectedCardReason} capability={canPatchReplaceTitle} />}
          args={<>{valueTargetInput("rename target")}{textInput("rename title")}</>}
          shortcut="E"
          result={featureResult("Edit card")}
        >
          <ActionButton disabledReason={selectedCardReason ?? canDisabledReason(canPatchReplaceTitle)} onClick={executeRenameCard}>Rename</ActionButton>
        </CommandRow>
        <CommandRow
          title="Commit rename"
          api="doc.commit(replace title, selection)"
          status={<CommandState reason={selectedCardReason} capability={canReplaceTargetTitle} />}
          args={<>{valueTargetInput("commit target")}{textInput("commit title")}</>}
          result={featureResult("Edit card")}
        >
          <ActionButton disabledReason={selectedCardReason ?? canDisabledReason(canReplaceTargetTitle)} onClick={() => run(`doc.commit([{ op: "replace", path: "${targetTitlePath}", value }], { selection })`, commitReplaceTitle, "Edit card")}>Commit</ActionButton>
        </CommandRow>
        <CommandRow
          title="Replace points"
          api="doc.patch(replace points)"
          status={<CommandState reason={selectedCardReason} capability={canPatchReplacePoints} />}
          args={<>{valueTargetInput("points target")}{numberInput("points value", pointsPayload, setPointsPayload)}</>}
          result={featureResult("Edit card")}
        >
          <ActionButton disabledReason={selectedCardReason ?? canDisabledReason(canPatchReplacePoints)} onClick={() => run(`doc.patch([{ op: "replace", path: "${targetPointsPath}", value: points }])`, () => doc.patch([{ op: "replace", path: targetPointsPath, value: pointsValue }]), "Edit card")}>Replace points</ActionButton>
        </CommandRow>
        <CommandRow
          title="Check invalid points"
          api="doc.canPatch(replace invalid points)"
          status={<CommandState reason={selectedCardReason} capability={canPatchBadPoints} />}
          args={<>{valueTargetInput("invalid points target")}{numberInput("invalid points value", badPointsPayload, setBadPointsPayload)}</>}
          result={featureResult("Edit card")}
        >
          <ActionButton disabledReason={selectedCardReason} onClick={() => run(`doc.canPatch([{ op: "replace", path: "${targetPointsPath}", value: badPoints }])`, () => canPatchBadPoints, "Edit card")}>Check invalid</ActionButton>
        </CommandRow>
        <CommandRow
          title="Delete card"
          api="doc.delete(source)"
          status={<CommandState reason={selectedCardReason} capability={canPatchDeleteTarget} />}
          args={valueTargetInput("delete target")}
          shortcut="Del"
          result={featureResult("Delete card")}
        >
          <ActionButton disabledReason={selectedCardReason ?? canDisabledReason(canPatchDeleteTarget)} onClick={executeDeleteCommand}>Delete</ActionButton>
        </CommandRow>
      </>
    ),
    "flow-columns": (
      <>
        <CommandRow
          title="Move card"
          api="doc.move(source, target)"
          status={<CommandState reason={selectedCardReason} capability={canMoveTarget} />}
          args={<>{valueTargetInput("move source")}{insertTargetInput("move target")}</>}
          shortcut="M"
          result={featureResult("Move card")}
        >
          <ActionButton disabledReason={selectedCardReason ?? canDisabledReason(canMoveTarget)} onClick={executeMoveCard}>Move</ActionButton>
        </CommandRow>
        <CommandRow
          title="Duplicate card"
          api="doc.duplicate(source)"
          status={<CommandState reason={selectedCardReason} capability={canDuplicateTarget} />}
          args={valueTargetInput("duplicate source")}
          shortcut="D"
          result={featureResult("Duplicate card")}
        >
          <ActionButton disabledReason={selectedCardReason ?? canDisabledReason(canDuplicateTarget)} onClick={executeDuplicateCard}>Duplicate</ActionButton>
        </CommandRow>
      </>
    ),
    "selection-bulk": (
      <>
        <CommandRow title="Build selection" api="empty / collapse / selectRanges" shortcut="0 / 1 / 2" result={featureResult("Selection set")}>
          <ActionButton onClick={executeSelectNone}>select 0</ActionButton>
          <ActionButton onClick={executeSelectOne}>select 1</ActionButton>
          <ActionButton onClick={executeSelectMany}>select N</ActionButton>
        </CommandRow>
        <CommandRow title="Inspect selection" api="selection properties" status={<CommandState reason={bulkSelectionReason} />} result={featureResult("Selection set")}>
          <ActionButton disabledReason={bulkSelectionReason} onClick={() => run("selection read properties", inspectSelectionReads, "Selection set")}>Inspect</ActionButton>
        </CommandRow>
        <CommandRow title="Order selection" api="selection.orderRanges()" status={<CommandState reason={bulkSelectionReason} />} result={featureResult("Selection set")}>
          <ActionButton disabledReason={bulkSelectionReason} onClick={() => run("doc.selection?.orderRanges()", () => doc.selection?.orderRanges(), "Selection set")}>Order</ActionButton>
        </CommandRow>
        <CommandRow title="Restore selection" api="selection.restore(snapshot)" status={<CommandState reason={bulkSelectionReason} />} result={featureResult("Selection set")}>
          <ActionButton disabledReason={bulkSelectionReason} onClick={() => run("doc.selection?.restore(snapshot)", selectionRestoreRoundtrip, "Selection set")}>Restore</ActionButton>
        </CommandRow>
        <CommandRow title="Delete selected" api="doc.delete(source)" status={<CommandState reason={bulkSelectionReason} capability={canDeleteSource} />} shortcut="Del" result={featureResult("Bulk cards")}>
          <ActionButton disabledReason={bulkSelectionReason ?? canDisabledReason(canDeleteSource)} onClick={executeDeleteCommand}>Delete</ActionButton>
        </CommandRow>
      </>
    ),
    "clipboard-reuse": (
      <>
        <CommandRow title="Read clipboard" api="doc.clipboard.read()" result={featureResult("Clipboard buffer")}>
          <ActionButton onClick={() => run("doc.clipboard.read()", () => doc.clipboard.read(), "Clipboard buffer")}>Read</ActionButton>
        </CommandRow>
        <CommandRow
          title="Write clipboard"
          api="doc.clipboard.write(payload)"
          args={<>{valueTargetInput("clipboard source")}{payloadInput("clipboard payload")}</>}
          result={featureResult("Clipboard buffer")}
        >
          <ActionButton onClick={() => run(`doc.clipboard.write(payload, { source: "${valueTarget}" })`, () => { doc.clipboard.write(parsedPayload(), { source: valueTarget }); return doc.clipboard.read(); }, "Clipboard buffer")}>Write</ActionButton>
        </CommandRow>
        <CommandRow title="Clear clipboard" api="doc.clipboard.clear()" result={featureResult("Clipboard buffer")}>
          <ActionButton onClick={() => run("doc.clipboard.clear()", () => { doc.clipboard.clear(); return { cleared: true, hasData: doc.clipboard.hasData }; }, "Clipboard buffer")}>Clear</ActionButton>
        </CommandRow>
        <CommandRow title="Copy selected" api="doc.copy(source)" status={<CommandState reason={bulkSelectionReason} capability={canCopySource} />} shortcut="C" result={featureResult("Bulk cards")}>
          <ActionButton disabledReason={bulkSelectionReason ?? canDisabledReason(canCopySource)} onClick={executeCopyCommand}>Copy</ActionButton>
        </CommandRow>
        <CommandRow title="Cut selected" api="doc.cut(source)" status={<CommandState reason={bulkSelectionReason} capability={canCutSource} />} shortcut="X" result={featureResult("Bulk cards")}>
          <ActionButton disabledReason={bulkSelectionReason ?? canDisabledReason(canCutSource)} onClick={executeCutCommand}>Cut</ActionButton>
        </CommandRow>
        <CommandRow
          title="Paste selected into column"
          api="doc.paste(target)"
          status={<CommandState reason={bulkSelectionReason} capability={canPasteClipboardToInsertTarget} />}
          args={insertTargetInput("paste target")}
          shortcut="V"
          result={featureResult("Bulk cards")}
        >
          <ActionButton disabledReason={bulkSelectionReason ?? canDisabledReason(canPasteClipboardToInsertTarget)} onClick={executePasteCommand}>Paste</ActionButton>
        </CommandRow>
        <CommandRow
          title="Paste payload into column"
          api="doc.paste(target, { payload })"
          status={<CommandState reason={bulkSelectionReason} capability={canPasteDirectPayloadToInsertTarget} />}
          args={<>{insertTargetInput("payload target")}{payloadInput("column payload")}</>}
          result={featureResult("Bulk cards")}
        >
          <ActionButton disabledReason={bulkSelectionReason ?? canDisabledReason(canPasteDirectPayloadToInsertTarget)} onClick={() => run(`doc.paste("${insertTarget}", { payload, rekey })`, pasteDirectPayloadToInsertTarget, "Bulk cards")}>Paste payload</ActionButton>
        </CommandRow>
      </>
    ),
    "find-filter": (
      <>
        <CommandRow
          title="Search cards"
          api="doc.find(jsonpath)"
          status={<CommandState capability={canFindQuery} />}
          args={queryInput("search query")}
          result={featureResult("Find and select")}
        >
          <ActionButton disabledReason={canDisabledReason(canFindQuery)} onClick={() => run(`doc.find(${JSON.stringify(query)})`, queryPointers, "Find and select")}>Search</ActionButton>
        </CommandRow>
        <CommandRow
          title="Select search results"
          api="selection.selectRanges(query.pointers)"
          status={<CommandState capability={canFindQuery} />}
          args={queryInput("select query")}
          shortcut="F"
          result={featureResult("Find and select")}
        >
          <ActionButton disabledReason={canDisabledReason(canFindQuery)} onClick={executeSelectSearchResults}>Select</ActionButton>
        </CommandRow>
      </>
    ),
    "recovery-history": (
      <>
        <CommandRow title="Undo" api="doc.undo()" status={<CommandState capability={canUndo} />} shortcut="Cmd/Ctrl Z" result={featureResult("Undo and redo")}>
          <ActionButton disabledReason={canDisabledReason(canUndo)} onClick={executeUndo}>Undo</ActionButton>
        </CommandRow>
        <CommandRow title="Redo" api="doc.redo()" status={<CommandState capability={canRedo} />} shortcut="Cmd/Ctrl Shift Z" result={featureResult("Undo and redo")}>
          <ActionButton disabledReason={canDisabledReason(canRedo)} onClick={executeRedo}>Redo</ActionButton>
        </CommandRow>
        <CommandRow title="Bulk transaction" api="history.transaction" status={<CommandState reason={bulkSelectionReason} />} result={featureResult("Undo and redo")}>
          <ActionButton disabledReason={bulkSelectionReason} onClick={() => run("doc.history.transaction(options, fn)", transactionRename, "Undo and redo")}>Transaction</ActionButton>
        </CommandRow>
        <CommandRow title="Merge last history" api="history.mergeLast" result={featureResult("Undo and redo")}>
          <ActionButton onClick={() => run("doc.history.mergeLast({ mergeKey: \"manual\" })", () => doc.history.mergeLast({ mergeKey: "manual" }), "Undo and redo")}>Merge</ActionButton>
        </CommandRow>
      </>
    ),
    integration: (
      <>
        <CommandRow title="Apply operation" api="applyOperation(schema, board, operation)" result={featureResult("Board plumbing")}>
          <ActionButton onClick={() => run("applyOperation(schema, board, operation)", inspectApplyOperation, "Board plumbing")}>Apply op</ActionButton>
        </CommandRow>
        <CommandRow title="Apply external patch" api="applyPatch(schema, board, patch)" result={featureResult("Board plumbing")}>
          <ActionButton onClick={() => run("applyPatch(schema, board, patch)", inspectApplyPatch, "Board plumbing")}>Apply</ActionButton>
        </CommandRow>
        <CommandRow title="Apply trusted patch" api="applyPatchToTrustedState(schema, board, patch)" result={featureResult("Board plumbing")}>
          <ActionButton onClick={() => run("applyPatchToTrustedState(schema, board, patch)", inspectApplyPatchToTrustedState, "Board plumbing")}>Trusted</ActionButton>
        </CommandRow>
        <CommandRow title="Track pointer through patch" api="trackPointer(pointer, patch)" result={featureResult("Board plumbing")}>
          <ActionButton onClick={() => run("trackPointer(pointer, patch)", inspectTrackPointer, "Board plumbing")}>Track</ActionButton>
        </CommandRow>
        <CommandRow title="Pointer helpers" api="parse/build/segment helpers" result={featureResult("Board plumbing")}>
          <ActionButton onClick={() => run("pointer helpers", inspectPointerHelpers, "Board plumbing")}>Inspect</ActionButton>
        </CommandRow>
      </>
    ),
  };

  return (
    <div className="flex w-full flex-col gap-4">
      <section className="grid gap-4 xl:grid-cols-[15rem_minmax(0,1fr)]">
        <aside data-flow-rail="" className="self-start rounded border border-stone-200 bg-white p-3 xl:sticky xl:top-3 xl:max-h-[calc(100vh-1.5rem)] xl:overflow-auto">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <strong className="text-sm text-stone-950">Interface bench</strong>
            <Badge>selected {selectedCount}</Badge>
            <Badge>undo {doc.history.undoDepth}</Badge>
            <Badge>redo {doc.history.redoDepth}</Badge>
            <Badge>clipboard {doc.clipboard.hasData ? "set" : "empty"}</Badge>
          </div>

          <nav aria-label="Kanban feature flow" className="grid gap-1">
            {featureStages.map((stage, index) => {
              const active = stage.id === activeStageId;
              return (
                <button
                  key={stage.id}
                  type="button"
                  aria-current={active ? "step" : undefined}
                  aria-label={stage.title}
                  onClick={() => setActiveStageId(stage.id)}
                  className={`grid grid-cols-[1.75rem_minmax(0,1fr)] items-center gap-2 rounded border px-2 py-2 text-left text-xs ${active ? "border-stone-900 bg-stone-950 text-white" : "border-stone-200 bg-white text-stone-700 hover:border-stone-300 hover:bg-stone-50"}`}
                >
                  <span className={`font-mono text-[10px] ${active ? "text-stone-300" : "text-stone-400"}`}>
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="min-w-0 truncate">{stage.title}</span>
                </button>
              );
            })}
          </nav>

        </aside>

        <div className="grid min-w-0 gap-3">
          <section className="rounded border border-stone-200 bg-white p-3">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h2 className="m-0 text-sm font-semibold text-stone-950">Board</h2>
              <Badge>value {valueTarget}</Badge>
              <Badge>insert {insertTarget}</Badge>
            </div>
            <div className="grid gap-2 lg:grid-cols-3">
              {doc.value.lists.map((list, listIndex) => (
                <div key={list.id} className={`flex min-h-52 flex-col rounded border p-2 ${columnClass(list.id)}`}>
                  <div className="mb-2 flex items-center justify-between gap-2 px-1">
                    <h2 className="m-0 text-xs font-semibold uppercase tracking-wide text-stone-500">{list.name}</h2>
                    <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-medium text-stone-500">{list.cards.length}</span>
                  </div>
                  <div className="flex flex-1 flex-col gap-1.5">
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
                          className="flex min-h-16 flex-col items-stretch justify-between gap-1.5 rounded-md border border-stone-200 bg-white p-2 text-left text-xs shadow-sm hover:border-stone-300 hover:bg-stone-50 aria-selected:border-sky-500 aria-selected:bg-sky-50 aria-selected:ring-2 aria-selected:ring-sky-200"
                        >
                          <span className="min-w-0 font-medium text-stone-950">{card.title}</span>
                          <span className="flex items-center justify-between gap-2">
                            <span className="min-w-0 truncate text-[10px] text-stone-500">{pointer}</span>
                            <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase ${statusClass(card.status)}`}>
                              {card.status}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section data-stage-detail="" className="rounded border border-stone-200 bg-white p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h2 className="m-0 text-sm font-semibold text-stone-950">{activeStage.title}</h2>
              <Badge>{String(featureStages.findIndex((stage) => stage.id === activeStage.id) + 1).padStart(2, "0")}</Badge>
            </div>
            <div className="mb-3 flex flex-wrap gap-1">
              {activeStage.apis.map((api) => (
                <code key={api} className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-600">{api}</code>
              ))}
            </div>
            <div className="grid gap-1.5">
              {stageContent[activeStage.id]}
            </div>
          </section>

          <Inspect title="result" value={result} />
        </div>
      </section>

      <details
        data-api-coverage=""
        open={apiCoverageOpen}
        onToggle={(event) => setApiCoverageOpen(event.currentTarget.open)}
        className="rounded border border-stone-200 bg-white p-3"
      >
        <summary className="cursor-pointer text-sm font-semibold text-stone-700">API coverage index</summary>
        {apiCoverageOpen ? (
        <section className="mt-3 grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
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
          <ApiRow action={<ActionButton onClick={() => run('doc.patch([{ op: "add", path, value }])', () => doc.patch([{ op: "add", path: insertTarget, value: parsedPayload() }]))}>doc.patch</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("doc.commit(patch, options)", commitReplaceTitle)}>doc.commit</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run(`doc.duplicate("${valueTarget}", { rekey })`, duplicateTarget)}>doc.duplicate</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("doc.load(nextValue)", loadFixture)}>doc.load</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("doc.reset()", resetBoard)}>doc.reset</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("doc.subscribe(listener)", inspectSubscribe)}>doc.subscribe</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run(`doc.at("${valueTarget}")`, () => doc.at(valueTarget))}>doc.at</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run(`doc.exists("${valueTarget}")`, () => doc.exists(valueTarget))}>doc.exists</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run(`doc.find(${JSON.stringify(query)})`, queryPointers)}>doc.find</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run(`doc.query(${JSON.stringify(query)})`, () => doc.query(query))}>doc.query</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run('doc.entries("/lists/0/cards")', () => doc.entries("/lists/0/cards" as Pointer))}>doc.entries</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("doc.canPatch(patch)", () => canPatchReplaceTitle)}>doc.canPatch</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run(`doc.canFind(${JSON.stringify(query)})`, () => doc.canFind(query))}>doc.canFind</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run(`doc.canInsert("${insertTarget}", payload)`, () => doc.canInsert(insertTarget, parsedPayload()))}>doc.canInsert</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run(`doc.insert("${insertTarget}", payload)`, insertCardToTodo)}>doc.insert</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run(`doc.canReplace("${targetPointsPath}", pointsPayload)`, () => doc.canReplace(targetPointsPath, pointsValue))}>doc.canReplace</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run(`doc.replace("${targetTitlePath}", textPayload)`, () => doc.replace(targetTitlePath, textPayload))}>doc.replace</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("doc.canDelete(source)", () => doc.canDelete(selectedSource))}>doc.canDelete</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("doc.delete(source)", () => doc.delete(selectedSource))}>doc.delete</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run(`doc.canMove("${valueTarget}", "${insertTarget}")`, () => doc.canMove(valueTarget, insertTarget))}>doc.canMove</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run(`doc.move("${valueTarget}", "${insertTarget}")`, () => doc.move(valueTarget, insertTarget))}>doc.move</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run(`doc.canDuplicate("${valueTarget}", { rekey })`, () => doc.canDuplicate(valueTarget, { rekey: cardRekey() }))}>doc.canDuplicate</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("doc.canCopy(source)", () => doc.canCopy(selectedSource))}>doc.canCopy</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("doc.canCut(source)", () => doc.canCut(selectedSource))}>doc.canCut</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run(`doc.canPaste("${insertTarget}", { spread: true, rekey })`, () => doc.canPaste(insertTarget, { spread: true, rekey: cardRekey() }))}>doc.canPaste</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run(`doc.canPaste("${insertTarget}", { payload })`, () => doc.canPaste(insertTarget, { payload: parsedPayload() }))}>doc.canPaste payload</ActionButton>} />
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
          <ApiRow action={<ActionButton onClick={() => run("doc.copy(source)", copySelection)}>doc.copy</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("doc.cut(source)", () => doc.cut(selectedSource))}>doc.cut</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run(`doc.paste("${insertTarget}", { spread: true, rekey })`, pasteClipboardToInsertTarget)}>doc.paste</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run(`doc.paste("${insertTarget}", { payload, rekey })`, pasteDirectPayloadToInsertTarget)}>doc.paste payload</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run(`doc.paste({ after: "${valueTarget}" })`, pasteClipboardAfterTarget)}>doc.paste after</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run(`doc.paste({ after: "${valueTarget}" }, { payload, rekey })`, pasteDirectPayloadAfterTarget)}>doc.paste payload after</ActionButton>} />
        </ActionGroup>

        <ActionGroup title="history API">
          <ApiRow action={<ActionButton onClick={() => run("doc.history.canUndo", () => doc.history.canUndo)}>history.canUndo</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("doc.history.canRedo", () => doc.history.canRedo)}>history.canRedo</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("doc.history.undoDepth", () => doc.history.undoDepth)}>history.undoDepth</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("doc.history.redoDepth", () => doc.history.redoDepth)}>history.redoDepth</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("doc.undo()", () => doc.undo())}>doc.undo</ActionButton>} />
          <ApiRow action={<ActionButton onClick={() => run("doc.redo()", () => doc.redo())}>doc.redo</ActionButton>} />
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
        ) : null}
      </details>

      <section className="grid gap-3 lg:grid-cols-3">
        <Inspect title="selection state" value={{ selected: selectedLabel(selectedPointers), primary: primaryPointer, snapshot: doc.selection?.snapshot() }} />
        <Inspect title="clipboard buffer" value={clipboardSnapshot} />
        <Inspect title="state" value={{ valueTarget, insertTarget, value: doc.value, lastPatch: doc.lastPatch }} />
      </section>
    </div>
  );
}

function Badge({ children }: { children: ReactNode }) {
  return <span className="rounded bg-stone-100 px-2 py-1 text-xs text-stone-600">{children}</span>;
}

function CommandRow(props: {
  title: string;
  api: string;
  status?: ReactNode;
  args?: ReactNode;
  shortcut?: string;
  result?: BenchResult;
  children: ReactNode;
}) {
  return (
    <div data-command-row="" className="rounded border border-stone-200 bg-stone-50 p-2">
      <div className="mb-1 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="m-0 text-xs font-semibold text-stone-900">{props.title}</h3>
          <code className="block truncate text-[10px] text-stone-500">{props.api}</code>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {props.shortcut ? <kbd className="rounded border border-stone-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-stone-500">{props.shortcut}</kbd> : null}
          {props.status}
        </div>
      </div>
      {props.args ? <div className="mb-1.5 grid gap-1.5">{props.args}</div> : null}
      <div className="flex flex-wrap gap-1.5">{props.children}</div>
      {props.result ? <CommandResult result={props.result} /> : null}
    </div>
  );
}

function CommandState(props: {
  reason?: string;
  capability?: JSONCapabilityResult;
}) {
  const blocked = props.reason !== undefined || props.capability?.ok === false;
  const text = stateStatus(props.reason)
    ?? (props.capability ? `can ${capabilityStatus(props.capability)}` : "ready");
  return (
    <span
      data-command-state=""
      className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${blocked ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}
    >
      {text}
    </span>
  );
}

function CommandArg(props: {
  label: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <label className={`flex min-w-0 flex-col gap-1 ${props.wide ? "" : "sm:max-w-72"}`}>
      <span className="text-[10px] font-semibold uppercase tracking-wide text-stone-400">{props.label}</span>
      {props.children}
    </label>
  );
}

function CommandResult({ result }: { result: BenchResult }) {
  return (
    <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-stone-600">
      <code className="max-w-full truncate rounded bg-white px-1.5 py-0.5">{result.call}</code>
      {result.bindings?.map((item) => (
        <span key={item} className="rounded bg-sky-50 px-1.5 py-0.5 text-sky-700">{item}</span>
      ))}
      {result.effect?.map((item) => (
        <span key={item} className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700">{item}</span>
      ))}
      {resultSummary(result.value, result.call).map((item) => (
        <span key={item} className="rounded bg-white px-1.5 py-0.5">{item}</span>
      ))}
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
    <div className="grid gap-3 overflow-auto">
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
