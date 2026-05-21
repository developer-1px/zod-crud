// API collection editor — Postman/Insomnia 류 데모.
// zod-crud 의 4기둥(select·edit·clipboard·undo) + RFC 9535 JSONPath bulk 시연.
//
// 의도적으로 단일 파일. UI 는 inline style — Tailwind/CSS 의존 없음.

import { useCallback, useMemo, useRef, useState } from "react";
import type { JSONPatchOperation } from "zod-crud";
import { useJSONDocument } from "zod-crud/react";
import { Collection, SAMPLE, type Item, type Folder, type Request, type Header, type Method } from "./schema.js";

const ALL_METHODS: ReadonlyArray<Method> = ["GET", "POST", "PUT", "PATCH", "DELETE"];

type Clipboard = { kind: "items"; items: Item[] } | null;
type SelectedEntry = { pointer: string; item: Item };

const METHOD_COLOR: Record<Request["method"], string> = {
  GET: "#0a7",
  POST: "#06c",
  PUT: "#a60",
  PATCH: "#a60",
  DELETE: "#c33",
};

// pointer 한 개로 트리 안의 값을 가져온다 (보기·복사용).
function getAt(root: { items: Item[] }, pointer: string): unknown {
  if (!pointer) return null;
  const segments = pointer.split("/").slice(1).map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~"));
  let cur: unknown = root;
  for (const segment of segments) {
    if (cur && typeof cur === "object") {
      cur = (cur as Record<string, unknown>)[segment];
    } else return null;
  }
  return cur;
}

function isRequest(value: unknown): value is Request {
  return Boolean(value && typeof value === "object" && (value as { kind?: unknown }).kind === "request");
}

function isFolder(value: unknown): value is Folder {
  return Boolean(value && typeof value === "object" && (value as { kind?: unknown }).kind === "folder");
}

function isItem(value: unknown): value is Item {
  return isRequest(value) || isFolder(value);
}

function getItemAt(root: { items: Item[] }, pointer: string): Item | null {
  const value = getAt(root, pointer);
  return isItem(value) ? value : null;
}

function cloneItem(item: Item): Item {
  return structuredClone(item);
}

function cloneItems(items: ReadonlyArray<Item>): Item[] {
  return items.map(cloneItem);
}

function collectItemPointers(items: ReadonlyArray<Item>, parentPointer = ""): string[] {
  const out: string[] = [];
  items.forEach((item, index) => {
    const pointer = `${parentPointer}/items/${index}`;
    out.push(pointer);
    if (item.kind === "folder") out.push(...collectItemPointers(item.items, pointer));
  });
  return out;
}

// pointer 를 정렬해 "역순" 으로 순회 가능하게 한다 (배열 인덱스 변동 방지).
function sortPointersDesc(pointers: readonly string[]): string[] {
  return [...pointers].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
}

export function ApiCollection() {
  const doc = useJSONDocument(Collection, SAMPLE, {
    history: 200,
    selection: { mode: "extended" },
  });
  const clipboardRef = useRef<Clipboard>(null);
  const [jsonPathExpression, setJsonPathExpression] = useState("$..items[?(@.method=='POST')]");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [rangeAnchor, setRangeAnchor] = useState<string | null>(null);
  const [toast, setToast] = useState<string>("");

  const flash = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast((t) => (t === msg ? "" : t)), 2400);
  }, []);

  const selectedPointers = doc.selection?.selectedPointers ?? [];
  const visibleItemPointers = useMemo(() => collectItemPointers(doc.value.items), [doc.value]);
  const selectedEntries = useMemo(
    () => selectedPointers
      .map((pointer): SelectedEntry | null => {
        const item = getItemAt(doc.value, pointer);
        return item ? { pointer, item } : null;
      })
      .filter((entry): entry is SelectedEntry => entry !== null),
    [selectedPointers, doc.value],
  );
  const selectedItems = useMemo(() => selectedEntries.map(({ item }) => item), [selectedEntries]);

  // ── selection ────────────────────────────────────────────────────────────
  const onClickRow = useCallback((pointer: string, e: React.MouseEvent) => {
    if (!doc.selection) return;
    if (e.shiftKey && rangeAnchor) {
      const anchorIndex = visibleItemPointers.indexOf(rangeAnchor);
      const focusIndex = visibleItemPointers.indexOf(pointer);
      if (anchorIndex >= 0 && focusIndex >= 0) {
        const [start, end] = anchorIndex <= focusIndex ? [anchorIndex, focusIndex] : [focusIndex, anchorIndex];
        const range = visibleItemPointers.slice(start, end + 1);
        doc.selection.selectRanges(range, undefined, undefined, range.indexOf(pointer));
        return;
      }
    }
    if (e.metaKey || e.ctrlKey) doc.selection.togglePointer(pointer);
    else doc.selection.collapse(pointer);
    setRangeAnchor(pointer);
  }, [doc.selection, rangeAnchor, visibleItemPointers]);

  // ── JSONPath bulk select (RFC 9535) ──────────────────────────────────────
  const runQuery = useCallback((expr: string) => {
    const r = doc.query(expr);
    if (!r.ok) {
      flash(`JSONPath 오류: ${r.reason}`);
      return;
    }
    const pointers = r.pointers;
    if (pointers.length === 0) { flash("매칭 없음"); return; }
    doc.selection?.selectRanges(pointers, undefined, undefined, Math.max(0, pointers.length - 1));
    setRangeAnchor(pointers[0] ?? null);
    flash(`${pointers.length}개 매칭 — 선택됨`);
  }, [doc, doc.selection, flash]);

  const selectByMethod = useCallback((method: Method) => {
    const expr = `$..items[?(@.method=='${method}')]`;
    setJsonPathExpression(expr);
    runQuery(expr);
  }, [runQuery]);

  const selectAllRequests = useCallback(() => {
    const expr = `$..items[?(@.kind=='request')]`;
    setJsonPathExpression(expr);
    runQuery(expr);
  }, [runQuery]);

  // ── bulk: 선택된 모든 request 에 X-Trace-Id 헤더 추가 (단일 patch) ───────
  const bulkAddTraceHeader = useCallback(() => {
    const requests = selectedEntries
      .filter((entry): entry is { item: Request; pointer: string } => entry.item.kind === "request");
    if (requests.length === 0) { flash("선택된 request 가 없음"); return; }
    const traceHeader: Header = { key: "X-Trace-Id", value: "{{$randomUUID}}" };
    const patch: JSONPatchOperation[] = requests.map(({ item, pointer }) => ({
      op: "replace",
      path: `${pointer}/headers`,
      value: [...item.headers, traceHeader],
    }));
    doc.patch(patch);
    flash(`${requests.length}개 request 에 X-Trace-Id 추가됨 (한 patch · 한 undo step)`);
  }, [selectedEntries, doc, flash]);

  // ── clipboard ────────────────────────────────────────────────────────────
  const copy = useCallback(() => {
    if (selectedItems.length === 0) { flash("선택 없음"); return; }
    clipboardRef.current = { kind: "items", items: cloneItems(selectedItems) };
    flash(`${selectedItems.length}개 복사됨`);
  }, [selectedItems, flash]);

  const cut = useCallback(() => {
    if (selectedItems.length === 0) { flash("선택 없음"); return; }
    clipboardRef.current = { kind: "items", items: cloneItems(selectedItems) };
    // 역순 — 배열 인덱스 shift 방지.
    const patch: JSONPatchOperation[] = sortPointersDesc(selectedEntries.map(({ pointer }) => pointer))
      .map((pointer) => ({ op: "remove", path: pointer }));
    doc.patch(patch);
    doc.selection?.empty();
    setRangeAnchor(null);
    flash(`${selectedItems.length}개 잘라내기`);
  }, [selectedItems, selectedEntries, doc, doc.selection, flash]);

  // 선택된 첫 폴더 안에 paste. 없으면 root.
  const paste = useCallback(() => {
    const cb = clipboardRef.current;
    if (!cb || cb.items.length === 0) { flash("클립보드 비어 있음"); return; }
    const targetPtr = selectedEntries.find(({ item }) => item.kind === "folder")?.pointer ?? "";
    let targetItems: ReadonlyArray<Item>;
    if (targetPtr) {
      const targetItem = getItemAt(doc.value, targetPtr);
      if (!isFolder(targetItem)) { flash("대상 folder 없음"); return; }
      targetItems = targetItem.items;
    } else {
      targetItems = doc.value.items;
    }
    const basePath = `${targetPtr}/items`;
    const startIdx = targetItems.length;
    const patch: JSONPatchOperation[] = cb.items.map((it, i) => ({
      op: "add",
      path: `${basePath}/${startIdx + i}`,
      value: cloneItem(it),
    }));
    doc.patch(patch);
    flash(`${cb.items.length}개 → ${targetPtr || "/"}/items 에 붙여넣기`);
  }, [selectedEntries, doc, doc.value, flash]);

  const clearSelection = useCallback(() => {
    doc.selection?.empty();
    setRangeAnchor(null);
  }, [doc.selection]);

  // ── render ───────────────────────────────────────────────────────────────
  return (
    <div style={S.root}>
      <header style={S.header}>
        <h1 style={S.h1}>API collection</h1>
      </header>

      <div style={S.toolbar}>
        <span style={S.toolbarLabel}>history</span>
        <button onClick={() => doc.history.undo()} disabled={!doc.history.canUndo}>undo</button>
        <button onClick={() => doc.history.redo()} disabled={!doc.history.canRedo}>redo</button>
        <span style={S.sep} />
        <span style={S.toolbarLabel}>clipboard</span>
        <button onClick={copy} disabled={selectedItems.length === 0}>copy ({selectedItems.length})</button>
        <button onClick={cut} disabled={selectedItems.length === 0}>cut</button>
        <button onClick={paste}>paste</button>
        <span style={S.sep} />
        <button onClick={() => { doc.reset(); setRangeAnchor(null); }}>reset</button>
      </div>

      <div style={S.queryBar}>
        <span style={S.toolbarLabel}>filter</span>
        {ALL_METHODS.map((m) => (
          <button key={m} onClick={() => selectByMethod(m)} style={{ ...S.chip, color: METHOD_COLOR[m], borderColor: METHOD_COLOR[m] }}>
            {m}
          </button>
        ))}
        <button onClick={selectAllRequests} style={S.chip}>모든 request</button>
        <button onClick={clearSelection} style={S.chip}>해제</button>
        <span style={S.sep} />
        <button onClick={bulkAddTraceHeader} disabled={selectedItems.length === 0}>
          + X-Trace-Id (선택 일괄)
        </button>
        <button onClick={() => setShowAdvanced((v) => !v)} style={S.linkBtn}>
          {showAdvanced ? "− advanced" : "+ advanced"}
        </button>
      </div>

      {showAdvanced && (
        <div style={S.queryBar}>
          <span style={S.toolbarLabel}>JSONPath</span>
          <input
            value={jsonPathExpression}
            onChange={(e) => setJsonPathExpression(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") runQuery(jsonPathExpression); }}
            style={S.input}
            spellCheck={false}
          />
          <button onClick={() => runQuery(jsonPathExpression)}>실행</button>
        </div>
      )}

      <div style={S.body}>
        <div style={S.left}>
          <Tree
            items={doc.value.items}
            parentPointer=""
            selected={selectedPointers}
            onClickRow={onClickRow}
          />
        </div>
        <aside style={S.right}>
          <h3 style={S.h3}>Selection</h3>
          {selectedPointers.length === 0 ? (
            <div style={S.muted}>—</div>
          ) : (
            <ul style={S.pointerList}>
              {selectedPointers.map((p) => (
                <li key={p}><code style={S.pointer}>{p}</code></li>
              ))}
            </ul>
          )}
          <h3 style={S.h3}>Clipboard</h3>
          <div style={S.muted}>
            {clipboardRef.current ? `${clipboardRef.current.items.length} item(s)` : "—"}
          </div>
          <h3 style={S.h3}>History</h3>
          <div style={S.muted}>
            undo: {doc.history.canUndo ? "✓" : "—"} · redo: {doc.history.canRedo ? "✓" : "—"}
          </div>
        </aside>
      </div>

      {toast && <div style={S.toast}>{toast}</div>}
    </div>
  );
}

// ── tree row ──────────────────────────────────────────────────────────────
function Tree(props: {
  items: ReadonlyArray<Item>;
  parentPointer: string;
  selected: ReadonlyArray<string>;
  onClickRow: (pointer: string, e: React.MouseEvent) => void;
}) {
  return (
    <ul style={S.tree}>
      {props.items.map((item, i) => {
        const pointer = `${props.parentPointer}/items/${i}`;
        const isSelected = props.selected.includes(pointer);
        return (
          <li key={pointer}>
            <div
              role="treeitem"
              aria-selected={isSelected}
              onClick={(e) => props.onClickRow(pointer, e)}
              style={{ ...S.row, background: isSelected ? "#dbeafe" : undefined }}
            >
              {item.kind === "folder" ? (
                <>
                  <span style={S.folderGlyph}>▾</span>
                  <strong>{item.name}</strong>
                  <span style={S.muted2}>· folder</span>
                </>
              ) : (
                <>
                  <span style={{ ...S.method, color: METHOD_COLOR[item.method] }}>{item.method}</span>
                  <span style={S.reqName}>{item.name}</span>
                  <code style={S.url}>{item.url}</code>
                  {item.headers.length > 0 && <span style={S.muted2}>· {item.headers.length} hdr</span>}
                </>
              )}
            </div>
            {item.kind === "folder" && item.items.length > 0 && (
              <Tree items={item.items} parentPointer={pointer} selected={props.selected} onClickRow={props.onClickRow} />
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ── inline styles ─────────────────────────────────────────────────────────
const S = {
  root: { fontFamily: "ui-sans-serif, system-ui, sans-serif", color: "#111", padding: 16, maxWidth: 1100, margin: "0 auto" } as React.CSSProperties,
  header: { marginBottom: 12 } as React.CSSProperties,
  h1: { margin: 0, fontSize: 22 } as React.CSSProperties,
  toolbar: { display: "flex", gap: 6, alignItems: "center", padding: "8px 0", borderBottom: "1px solid #eee" } as React.CSSProperties,
  jsonpathBar: { display: "flex", gap: 6, alignItems: "center", padding: "8px 0", borderBottom: "1px solid #eee" } as React.CSSProperties,
  queryBar: { display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", padding: "8px 0", borderBottom: "1px solid #eee" } as React.CSSProperties,
  chip: { fontFamily: "ui-monospace, monospace", fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 4, border: "1px solid #ccc", background: "#fff", cursor: "pointer" } as React.CSSProperties,
  linkBtn: { background: "none", border: "none", color: "#06c", fontSize: 12, cursor: "pointer", marginLeft: "auto", textDecoration: "underline" } as React.CSSProperties,
  reqName: { fontWeight: 500 } as React.CSSProperties,
  jsonpathLabel: { fontSize: 11, color: "#666", textTransform: "uppercase" as const, letterSpacing: 1, marginRight: 4 },
  toolbarLabel: { fontSize: 10, color: "#999", textTransform: "uppercase" as const, letterSpacing: 1, marginRight: 2 },
  input: { flex: 1, fontFamily: "ui-monospace, monospace", fontSize: 13, padding: "4px 8px", border: "1px solid #ccc", borderRadius: 4 } as React.CSSProperties,
  sep: { width: 1, height: 18, background: "#ddd", margin: "0 6px" } as React.CSSProperties,
  body: { display: "grid", gridTemplateColumns: "1fr 280px", gap: 16, marginTop: 12 } as React.CSSProperties,
  left: { borderRight: "1px solid #eee", paddingRight: 12 } as React.CSSProperties,
  right: { fontSize: 13 } as React.CSSProperties,
  h3: { fontSize: 11, color: "#666", textTransform: "uppercase" as const, letterSpacing: 1, marginTop: 12, marginBottom: 4 },
  tree: { listStyle: "none", margin: 0, padding: "0 0 0 14px" } as React.CSSProperties,
  row: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "4px 8px", borderRadius: 4, cursor: "pointer", fontSize: 14 } as React.CSSProperties,
  folderGlyph: { color: "#888", width: 12, display: "inline-block" } as React.CSSProperties,
  method: { fontFamily: "ui-monospace, monospace", fontSize: 11, fontWeight: 700, width: 52, display: "inline-block" } as React.CSSProperties,
  url: { fontFamily: "ui-monospace, monospace", fontSize: 12, color: "#444" } as React.CSSProperties,
  muted: { color: "#888", fontSize: 12 } as React.CSSProperties,
  muted2: { color: "#aaa", fontSize: 12 } as React.CSSProperties,
  pointerList: { listStyle: "none", padding: 0, margin: 0, maxHeight: 180, overflow: "auto" } as React.CSSProperties,
  pointer: { fontFamily: "ui-monospace, monospace", fontSize: 11, color: "#333" } as React.CSSProperties,
  toast: { position: "fixed", bottom: 16, left: "50%", transform: "translateX(-50%)", background: "#111", color: "#fff", padding: "8px 14px", borderRadius: 4, fontSize: 13 } as React.CSSProperties,
};
