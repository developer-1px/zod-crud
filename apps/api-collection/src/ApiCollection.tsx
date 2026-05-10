// API collection editor — Postman/Insomnia 류 데모.
// zod-crud 의 4기둥(select·edit·clipboard·undo) + RFC 9535 JSONPath bulk 시연.
//
// 의도적으로 단일 파일. UI 는 inline style — Tailwind/CSS 의존 없음.

import { useCallback, useMemo, useRef, useState } from "react";
import { useJsonDocument, type JsonPatchOperation } from "zod-crud";
import { Collection, SAMPLE, type Item, type Folder, type Request, type Header } from "./schema.js";

type Clipboard = { kind: "items"; items: Item[] } | null;

const METHOD_COLOR: Record<Request["method"], string> = {
  GET: "#0a7",
  POST: "#06c",
  PUT: "#a60",
  PATCH: "#a60",
  DELETE: "#c33",
};

// pointer 한 개로 트리 안의 Item 을 가져온다 (보기·복사용).
function getAt(root: { items: Item[] }, pointer: string): Item | null {
  if (!pointer) return null;
  const segs = pointer.split("/").slice(1).map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~"));
  let cur: unknown = root;
  for (const s of segs) {
    if (cur && typeof cur === "object") {
      cur = (cur as Record<string, unknown>)[s];
    } else return null;
  }
  return cur as Item | null;
}

// pointer 를 정렬해 "역순" 으로 순회 가능하게 한다 (배열 인덱스 변동 방지).
function sortPointersDesc(pointers: readonly string[]): string[] {
  return [...pointers].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
}

export function ApiCollection() {
  const doc = useJsonDocument(Collection, SAMPLE, {
    history: 200,
    selection: { mode: "extended" },
  });
  const clipboardRef = useRef<Clipboard>(null);
  const [pathExpr, setPathExpr] = useState("$..items[?(@.method=='POST')]");
  const [toast, setToast] = useState<string>("");

  const flash = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast((t) => (t === msg ? "" : t)), 2400);
  }, []);

  const selectedPointers = doc.selection?.ranges ?? [];
  const selectedItems = useMemo(
    () => selectedPointers.map((p) => getAt(doc.value, p)).filter((x): x is Item => !!x),
    [selectedPointers, doc.value],
  );

  // ── selection ────────────────────────────────────────────────────────────
  const onClickRow = useCallback((pointer: string, e: React.MouseEvent) => {
    if (!doc.selection) return;
    if (e.metaKey || e.ctrlKey) doc.selection.toggleRange(pointer);
    else if (e.shiftKey && doc.selection.anchor) doc.selection.setBaseAndExtent(doc.selection.anchor, pointer);
    else doc.selection.collapse(pointer);
  }, [doc.selection]);

  // ── JSONPath bulk select (RFC 9535) ──────────────────────────────────────
  const runJsonPath = useCallback(() => {
    const r = doc.commands.find(pathExpr);
    if (!("ok" in r) || !r.ok) {
      flash(`JSONPath 오류: ${"reason" in r ? r.reason : "unknown"}`);
      return;
    }
    const ptrs = r.matches.map((m) => m.pointer);
    if (ptrs.length === 0) { flash("매칭 없음"); return; }
    doc.selection?.selectRanges(ptrs, ptrs[0] ?? null, ptrs[ptrs.length - 1] ?? null);
    flash(`${ptrs.length}개 매칭 — 선택됨`);
  }, [pathExpr, doc.commands, doc.selection, flash]);

  // ── bulk: 선택된 모든 request 에 X-Trace-Id 헤더 추가 (단일 patch) ───────
  const bulkAddTraceHeader = useCallback(() => {
    const requests = selectedItems
      .map((it, i) => ({ it, ptr: selectedPointers[i]! }))
      .filter((x): x is { it: Request; ptr: string } => x.it.kind === "request");
    if (requests.length === 0) { flash("선택된 request 가 없음"); return; }
    const traceHeader: Header = { key: "X-Trace-Id", value: "{{$randomUUID}}" };
    const patch: JsonPatchOperation[] = requests.map(({ it, ptr }) => ({
      op: "replace",
      path: `${ptr}/headers`,
      value: [...it.headers, traceHeader],
    }));
    doc.ops.patch(patch);
    flash(`${requests.length}개 request 에 X-Trace-Id 추가됨 (한 patch · 한 undo step)`);
  }, [selectedItems, selectedPointers, doc.ops, flash]);

  // ── clipboard ────────────────────────────────────────────────────────────
  const copy = useCallback(() => {
    if (selectedItems.length === 0) { flash("선택 없음"); return; }
    clipboardRef.current = { kind: "items", items: selectedItems };
    flash(`${selectedItems.length}개 복사됨`);
  }, [selectedItems, flash]);

  const cut = useCallback(() => {
    if (selectedItems.length === 0) { flash("선택 없음"); return; }
    clipboardRef.current = { kind: "items", items: selectedItems };
    // 역순 — 배열 인덱스 shift 방지.
    const patch: JsonPatchOperation[] = sortPointersDesc(selectedPointers).map((ptr) => ({ op: "remove", path: ptr }));
    doc.ops.patch(patch);
    doc.selection?.empty();
    flash(`${selectedItems.length}개 잘라내기`);
  }, [selectedItems, selectedPointers, doc.ops, doc.selection, flash]);

  // 선택된 첫 폴더 안에 paste. 없으면 root.
  const paste = useCallback(() => {
    const cb = clipboardRef.current;
    if (!cb || cb.items.length === 0) { flash("클립보드 비어 있음"); return; }
    const targetPtr = selectedPointers.find((p) => {
      const it = getAt(doc.value, p);
      return it?.kind === "folder";
    }) ?? "";
    const targetFolder = targetPtr ? (getAt(doc.value, targetPtr) as Folder) : doc.value;
    const basePath = `${targetPtr}/items`;
    const startIdx = targetFolder.items.length;
    const patch: JsonPatchOperation[] = cb.items.map((it, i) => ({
      op: "add",
      path: `${basePath}/${startIdx + i}`,
      value: it,
    }));
    doc.ops.patch(patch);
    flash(`${cb.items.length}개 → ${targetPtr || "/"}/items 에 붙여넣기`);
  }, [selectedPointers, doc.value, doc.ops, flash]);

  // ── render ───────────────────────────────────────────────────────────────
  return (
    <div style={S.root}>
      <header style={S.header}>
        <h1 style={S.h1}>zod-crud · API collection</h1>
        <div style={S.tag}>
          tree × selection × clipboard × undo · all backed by RFC 6901·6902·9535 + Zod
        </div>
      </header>

      <div style={S.toolbar}>
        <button onClick={() => doc.commands.undo()} disabled={!doc.history.canUndo}>undo</button>
        <button onClick={() => doc.commands.redo()} disabled={!doc.history.canRedo}>redo</button>
        <span style={S.sep} />
        <button onClick={copy} disabled={selectedItems.length === 0}>copy ({selectedItems.length})</button>
        <button onClick={cut} disabled={selectedItems.length === 0}>cut</button>
        <button onClick={paste}>paste →</button>
        <span style={S.sep} />
        <button onClick={() => doc.ops.reset()}>reset</button>
      </div>

      <div style={S.jsonpathBar}>
        <span style={S.jsonpathLabel}>JSONPath (RFC 9535)</span>
        <input
          value={pathExpr}
          onChange={(e) => setPathExpr(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") runJsonPath(); }}
          style={S.input}
          spellCheck={false}
        />
        <button onClick={runJsonPath}>select matches</button>
        <button onClick={bulkAddTraceHeader} disabled={selectedItems.length === 0} title="선택된 모든 request 에 X-Trace-Id 일괄 추가 — 단일 undo">
          + X-Trace-Id (bulk)
        </button>
      </div>

      <div style={S.body}>
        <div style={S.left}>
          <Tree
            items={doc.value.items}
            parentPtr=""
            selected={selectedPointers}
            onClickRow={onClickRow}
          />
        </div>
        <aside style={S.right}>
          <h3 style={S.h3}>Selection</h3>
          {selectedPointers.length === 0 ? (
            <div style={S.muted}>선택 없음 — 행 클릭, Shift/Ctrl+Click, 또는 위 JSONPath 사용</div>
          ) : (
            <ul style={S.ptrList}>
              {selectedPointers.map((p) => (
                <li key={p}><code style={S.ptr}>{p}</code></li>
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
  parentPtr: string;
  selected: ReadonlyArray<string>;
  onClickRow: (pointer: string, e: React.MouseEvent) => void;
}) {
  return (
    <ul style={S.tree}>
      {props.items.map((item, i) => {
        const ptr = `${props.parentPtr}/items/${i}`;
        const isSel = props.selected.includes(ptr);
        return (
          <li key={ptr}>
            <div
              role="treeitem"
              aria-selected={isSel}
              onClick={(e) => props.onClickRow(ptr, e)}
              style={{ ...S.row, background: isSel ? "#dbeafe" : undefined }}
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
                  <span>{item.name}</span>
                  <code style={S.url}>{item.url}</code>
                  {item.headers.length > 0 && <span style={S.muted2}>· {item.headers.length} header{item.headers.length > 1 ? "s" : ""}</span>}
                </>
              )}
            </div>
            {item.kind === "folder" && item.items.length > 0 && (
              <Tree items={item.items} parentPtr={ptr} selected={props.selected} onClickRow={props.onClickRow} />
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
  tag: { fontSize: 12, color: "#666", marginTop: 4 } as React.CSSProperties,
  toolbar: { display: "flex", gap: 6, alignItems: "center", padding: "8px 0", borderBottom: "1px solid #eee" } as React.CSSProperties,
  jsonpathBar: { display: "flex", gap: 6, alignItems: "center", padding: "8px 0", borderBottom: "1px solid #eee" } as React.CSSProperties,
  jsonpathLabel: { fontSize: 11, color: "#666", textTransform: "uppercase" as const, letterSpacing: 1, marginRight: 4 },
  input: { flex: 1, fontFamily: "ui-monospace, monospace", fontSize: 13, padding: "4px 8px", border: "1px solid #ccc", borderRadius: 4 } as React.CSSProperties,
  sep: { width: 1, height: 18, background: "#ddd", margin: "0 6px" } as React.CSSProperties,
  body: { display: "grid", gridTemplateColumns: "1fr 280px", gap: 16, marginTop: 12 } as React.CSSProperties,
  left: { borderRight: "1px solid #eee", paddingRight: 12 } as React.CSSProperties,
  right: { fontSize: 13 } as React.CSSProperties,
  h3: { fontSize: 11, color: "#666", textTransform: "uppercase" as const, letterSpacing: 1, marginTop: 12, marginBottom: 4 },
  tree: { listStyle: "none", margin: 0, padding: "0 0 0 14px" } as React.CSSProperties,
  row: { display: "flex", gap: 8, alignItems: "center", padding: "4px 8px", borderRadius: 4, cursor: "pointer", fontSize: 14 } as React.CSSProperties,
  folderGlyph: { color: "#888", width: 12, display: "inline-block" } as React.CSSProperties,
  method: { fontFamily: "ui-monospace, monospace", fontSize: 11, fontWeight: 700, width: 52, display: "inline-block" } as React.CSSProperties,
  url: { fontFamily: "ui-monospace, monospace", fontSize: 12, color: "#444" } as React.CSSProperties,
  muted: { color: "#888", fontSize: 12 } as React.CSSProperties,
  muted2: { color: "#aaa", fontSize: 12 } as React.CSSProperties,
  ptrList: { listStyle: "none", padding: 0, margin: 0, maxHeight: 180, overflow: "auto" } as React.CSSProperties,
  ptr: { fontFamily: "ui-monospace, monospace", fontSize: 11, color: "#333" } as React.CSSProperties,
  toast: { position: "fixed", bottom: 16, left: "50%", transform: "translateX(-50%)", background: "#111", color: "#fff", padding: "8px 14px", borderRadius: 6, fontSize: 13, boxShadow: "0 4px 12px rgba(0,0,0,0.2)" } as React.CSSProperties,
};
