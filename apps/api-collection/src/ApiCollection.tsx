// API collection editor — Postman/Insomnia 류 데모.
// zod-crud 의 4기둥(select·edit·clipboard·undo) + RFC 9535 JSONPath bulk 시연.
//
// 의도적으로 단일 파일. UI 는 inline style — Tailwind/CSS 의존 없음.

import { useCallback, useMemo, useRef, useState } from "react";
import { useJsonDocument, type JsonPatchOperation } from "zod-crud";
import { Collection, SAMPLE, type Item, type Folder, type Request, type Header, type Method } from "./schema.js";

const ALL_METHODS: ReadonlyArray<Method> = ["GET", "POST", "PUT", "PATCH", "DELETE"];

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
  const segments = pointer.split("/").slice(1).map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~"));
  let cur: unknown = root;
  for (const segment of segments) {
    if (cur && typeof cur === "object") {
      cur = (cur as Record<string, unknown>)[segment];
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
  const [jsonPathExpression, setJsonPathExpression] = useState("$..items[?(@.method=='POST')]");
  const [showAdvanced, setShowAdvanced] = useState(false);
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
  const runQuery = useCallback((expr: string) => {
    const r = doc.commands.find(expr);
    if (!("ok" in r) || !r.ok) {
      flash(`JSONPath 오류: ${"reason" in r ? r.reason : "unknown"}`);
      return;
    }
    const pointers = r.matches.map((m) => m.pointer);
    if (pointers.length === 0) { flash("매칭 없음"); return; }
    doc.selection?.selectRanges(pointers, pointers[0] ?? null, pointers[pointers.length - 1] ?? null);
    flash(`${pointers.length}개 매칭 — 선택됨`);
  }, [doc.commands, doc.selection, flash]);

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
    const requests = selectedItems
      .map((it, i) => ({ it, pointer: selectedPointers[i]! }))
      .filter((x): x is { it: Request; pointer: string } => x.it.kind === "request");
    if (requests.length === 0) { flash("선택된 request 가 없음"); return; }
    const traceHeader: Header = { key: "X-Trace-Id", value: "{{$randomUUID}}" };
    const patch: JsonPatchOperation[] = requests.map(({ it, pointer }) => ({
      op: "replace",
      path: `${pointer}/headers`,
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
    const patch: JsonPatchOperation[] = sortPointersDesc(selectedPointers).map((pointer) => ({ op: "remove", path: pointer }));
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
        <p style={S.lede}>
          <strong>왜 Postman 류인가</strong> — 폴더·요청이 임의 깊이로 중첩되고, 사용자가
          여러 요청을 가로질러 선택·복사·일괄수정·되돌리기를 모두 자연스럽게 기대하는 도메인.
          rich-text 도 form 도 아닌, "임의 JSON 트리에서 4기둥이 한꺼번에 필요한" 가장 깔끔한 빈자리다.
        </p>
        <details style={S.details}>
          <summary style={S.summary}>이 데모가 zod-crud 의 무엇을 증명하는가 ▾</summary>
          <ul style={S.proofList}>
            <li><strong>임의 JSON 트리</strong> — TipTap·Slate·Lexical 은 rich text 만, rjsf·Formily 는 form 만. 여기는 folder ⊃ folder ⊃ request 를 Zod 재귀 schema 로 표현 (<code>schema.ts</code>).</li>
            <li><strong>Selection 기둥 (RFC 6901 + W3C Selection)</strong> — Click / Shift+Click range / Cmd+Click toggle. 좌표는 모두 JSON Pointer.</li>
            <li><strong>Edit 기둥 (RFC 6902)</strong> — bulk 일괄 수정도 단일 <code>ops.patch([...])</code>. listener·history·undo 가 한 단위로 처리.</li>
            <li><strong>Clipboard 기둥</strong> — 서로 다른 폴더 사이 request 이동 — 텍스트 에디터로는 불가능.</li>
            <li><strong>Undo 기둥</strong> — bulk 동작 한 번 = undo 한 번. 200 step history.</li>
            <li><strong>RFC 9535 JSONPath</strong> — <code>$..items[?(@.method=='POST')]</code> 한 줄로 모든 POST 요청 일괄 선택. 다른 라이브러리는 직접 트리 순회 필요.</li>
            <li><strong>Zod 가 도큐먼트를 정의</strong> — 정적 타입 + 런타임 검증 동시. preFlight 가 잘못된 patch 를 commit 전에 막는다.</li>
          </ul>
        </details>
        <details style={S.details}>
          <summary style={S.summary}>시도해볼 시나리오 — 각 동작이 무엇을 건드리는가 ▾</summary>
          <ol style={S.tryList}>
            <li><em>Auth 폴더의 "Login" 클릭 → Shift+Click "Me"</em> — 3개 range select (W3C Selection extend).</li>
            <li><em>Cmd+Click 으로 Users/Create 추가</em> — 비연속 toggle.</li>
            <li><em>copy → Billing 폴더 클릭 → paste</em> — request 가 폴더 간 이동 (RFC 6902 add).</li>
            <li><em>filter 줄에서 <strong>POST</strong> 칩 클릭</em> — 트리 가로질러 모든 POST 요청 한번에 선택. 내부적으로 <code>$..items[?(@.method=='POST')]</code> 가 실행됨 (advanced 토글로 확인).</li>
            <li><em>+ X-Trace-Id (선택 일괄)</em> — 매치된 모든 request 에 헤더 일괄 추가. 단일 patch · 단일 undo step.</li>
            <li><em>undo 한 번</em> — bulk 가 한 step 으로 묶였는지 확인.</li>
            <li><em>DELETE 칩 클릭 → cut → 다른 폴더 paste</em> — 위험 동작들을 한 폴더로 격리.</li>
          </ol>
        </details>
      </header>

      <div style={S.toolbar}>
        <span style={S.toolbarLabel} title="Undo 기둥">history</span>
        <button onClick={() => doc.commands.undo()} disabled={!doc.history.canUndo} title="bulk 동작도 1 step 으로 묶임">undo</button>
        <button onClick={() => doc.commands.redo()} disabled={!doc.history.canRedo}>redo</button>
        <span style={S.sep} />
        <span style={S.toolbarLabel} title="Clipboard 기둥 — 트리 간 이동">clipboard</span>
        <button onClick={copy} disabled={selectedItems.length === 0}>copy ({selectedItems.length})</button>
        <button onClick={cut} disabled={selectedItems.length === 0}>cut</button>
        <button onClick={paste} title="선택된 첫 폴더(없으면 root) 에 추가">paste →</button>
        <span style={S.sep} />
        <button onClick={() => doc.ops.reset()}>reset</button>
      </div>

      <div style={S.queryBar}>
        <span style={S.toolbarLabel} title="RFC 9535 JSONPath 가 트리를 가로지르는 일괄 선택을 한 줄로">filter</span>
        {ALL_METHODS.map((m) => (
          <button key={m} onClick={() => selectByMethod(m)} style={{ ...S.chip, color: METHOD_COLOR[m], borderColor: METHOD_COLOR[m] }}>
            {m}
          </button>
        ))}
        <button onClick={selectAllRequests} style={S.chip}>모든 request</button>
        <button onClick={() => doc.selection?.empty()} style={S.chip}>해제</button>
        <span style={S.sep} />
        <button onClick={bulkAddTraceHeader} disabled={selectedItems.length === 0} title="선택된 모든 request 에 X-Trace-Id 일괄 추가 — 단일 patch · 단일 undo step">
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
            <div style={S.muted}>선택 없음 — 행 클릭, Shift/Ctrl+Click, 또는 위 JSONPath 사용</div>
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
                  <div style={S.reqDesc}>{item.description}</div>
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
  tag: { fontSize: 12, color: "#666", marginTop: 4 } as React.CSSProperties,
  lede: { fontSize: 14, color: "#333", lineHeight: 1.55, margin: "8px 0 12px", maxWidth: 760 } as React.CSSProperties,
  details: { fontSize: 13, marginBottom: 8, background: "#f8f8f6", border: "1px solid #eee", borderRadius: 6, padding: "6px 12px" } as React.CSSProperties,
  summary: { cursor: "pointer", fontWeight: 600, padding: "2px 0", color: "#444" } as React.CSSProperties,
  proofList: { margin: "8px 0 6px", paddingLeft: 22, lineHeight: 1.6, color: "#333" } as React.CSSProperties,
  tryList: { margin: "8px 0 6px", paddingLeft: 22, lineHeight: 1.7, color: "#333" } as React.CSSProperties,
  toolbar: { display: "flex", gap: 6, alignItems: "center", padding: "8px 0", borderBottom: "1px solid #eee" } as React.CSSProperties,
  jsonpathBar: { display: "flex", gap: 6, alignItems: "center", padding: "8px 0", borderBottom: "1px solid #eee" } as React.CSSProperties,
  queryBar: { display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", padding: "8px 0", borderBottom: "1px solid #eee" } as React.CSSProperties,
  chip: { fontFamily: "ui-monospace, monospace", fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 999, border: "1px solid #ccc", background: "#fff", cursor: "pointer" } as React.CSSProperties,
  linkBtn: { background: "none", border: "none", color: "#06c", fontSize: 12, cursor: "pointer", marginLeft: "auto", textDecoration: "underline" } as React.CSSProperties,
  reqName: { fontWeight: 500 } as React.CSSProperties,
  reqDesc: { fontSize: 12, color: "#888", marginLeft: 60, marginTop: 2, flexBasis: "100%" } as React.CSSProperties,
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
  toast: { position: "fixed", bottom: 16, left: "50%", transform: "translateX(-50%)", background: "#111", color: "#fff", padding: "8px 14px", borderRadius: 6, fontSize: 13, boxShadow: "0 4px 12px rgba(0,0,0,0.2)" } as React.CSSProperties,
};
