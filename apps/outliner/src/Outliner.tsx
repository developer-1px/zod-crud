// Outliner — Workflowy 모델: select mode + edit mode 분리.
// useJsonDocument facade + outliner-local clipboard·keymap·commands.

import { useCallback, useEffect, useRef, useState } from "react";
import { useJsonDocument, type Pointer, type JsonCrudError } from "zod-crud";
import { OutlineSchema, SAMPLE, type OutlineNode } from "./schema.js";
import { eventToChord, findCommand, KEYMAP, type CommandId, type Mode } from "./keymap.js";
import { useClipboard } from "./clipboard.js";
import * as cmd from "./commands.js";
import { readNode } from "./pointer-utils.js";

interface ToastMessage {
  id: number;
  level: "error" | "info";
  text: string;
}

let toastSeq = 0;

export function Outliner() {
  const [errors, setErrors] = useState<ToastMessage[]>([]);
  const [mode, setMode] = useState<Mode>("select");

  const pushToast = useCallback((level: "error" | "info", text: string) => {
    const id = ++toastSeq;
    setErrors((prev) => [...prev, { id, level, text }]);
    // info 는 짧게 자동 사라짐. error 는 사용자 클릭 시까지 유지 (zod 메시지가 길어서 읽을 시간 필요).
    if (level === "info") {
      setTimeout(() => setErrors((prev) => prev.filter((m) => m.id !== id)), 2500);
    }
  }, []);

  const dismissToast = useCallback((id: number) => {
    setErrors((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const onError = useCallback((e: JsonCrudError) => {
    pushToast("error", `${e.result.code}${e.result.reason ? `: ${e.result.reason}` : ""}`);
  }, [pushToast]);

  const doc = useJsonDocument(OutlineSchema, SAMPLE, {
    history: 200,
    strict: false,
    onError,
    selection: { mode: "extended" },
    focus: { initial: "" },
  });
  const clipboard = useClipboard();

  // 텍스트 편집 coalesce 정책 — UI 의 결정. zod-crud 는 시간을 모름.
  // 같은 row 의 text 에 연속으로 글자가 입력될 때 (500ms 안) 한 undo 단위로 합친다.
  const lastTextEditAtRef = useRef(0);
  const lastTextEditPathRef = useRef<string | null>(null);
  const TEXT_COALESCE_MS = 500;
  const onTextEdit = useCallback((path: string) => {
    const now = Date.now();
    if (lastTextEditPathRef.current === path && now - lastTextEditAtRef.current < TEXT_COALESCE_MS) {
      doc.history.mergeLast();
    }
    lastTextEditAtRef.current = now;
    lastTextEditPathRef.current = path;
  }, [doc.history]);

  // command 디스패치 — true 반환 = handled (preventDefault), false = not handled (DOM default 통과).
  const dispatch = useCallback((id: CommandId): boolean => {
    if (!doc.selection || !doc.focus) return false;
    const ctx = {
      state: doc.value,
      ops: doc.ops,
      selection: doc.selection,
      focus: doc.focus,
      clipboard,
    };
    // Command 가 JsonResult 를 반환하면 실패를 toast 로 surface (ops 경로 밖의 정합성 위반).
    const surface = (r: { ok: boolean; code?: string; reason?: string } | void) => {
      if (r && !r.ok) pushToast("error", `${r.code}${r.reason ? `: ${r.reason}` : ""}`);
    };
    switch (id) {
      case "enter-edit":     setMode("edit"); return true;
      case "exit-edit":      setMode("select"); return true;
      case "insert-sibling": surface(cmd.insertSibling(ctx)); setMode("edit"); return true;

      // edit 모드의 Backspace: 빈 텍스트일 때만 row 제거. 그 외에는 DOM 기본 (글자 삭제) 통과.
      case "remove-if-empty": {
        const f = doc.focus.value;
        if (f === null) return false;
        const node = readNode(doc.value, f);
        if (!node || node.text !== "") return false;
        cmd.remove(ctx);
        setMode("select");
        return true;
      }

      case "demote":         surface(cmd.demote(ctx)); return true;
      case "promote":        surface(cmd.promote(ctx)); return true;
      case "remove":         surface(cmd.remove(ctx)); return true;
      case "select-all":     cmd.selectAll(ctx); return true;
      case "focus-prev":     cmd.focusPrev(ctx); return true;
      case "focus-next":     cmd.focusNext(ctx); return true;
      case "focus-parent":   cmd.focusParent(ctx); return true;
      case "focus-first-child": cmd.focusFirstChild(ctx); return true;
      case "focus-first":    cmd.focusFirst(ctx); return true;
      case "focus-last":     cmd.focusLast(ctx); return true;
      case "extend-up":      cmd.extendSelection(ctx, "up"); return true;
      case "extend-down":    cmd.extendSelection(ctx, "down"); return true;
      case "move-up":        surface(cmd.moveUp(ctx)); return true;
      case "move-down":      surface(cmd.moveDown(ctx)); return true;
      case "copy":           cmd.copy(ctx); pushToast("info", `Copied ${ctx.selection.values.length || 1}`); return true;
      case "cut":            cmd.cut(ctx); pushToast("info", `Cut ${ctx.selection.values.length || 1}`); return true;
      case "paste-sibling":  surface(cmd.paste(ctx, "sibling")); return true;
      case "paste-child":    surface(cmd.paste(ctx, "child")); return true;
      case "undo":           doc.history.undo(); return true;
      case "redo":           doc.history.redo(); return true;
    }
  }, [doc, clipboard, pushToast]);

  // 키보드 dispatcher — chord + 현재 mode 로 lookup.
  // IME composition 중 키는 무시 (e.isComposing / keyCode 229).
  // dispatch 가 false 면 DOM 기본 동작 통과 (글자 삭제 등).
  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    const chord = eventToChord(e);
    const id = findCommand(chord, mode);
    if (!id) return;
    const handled = dispatch(id);
    if (handled) {
      e.preventDefault();
      e.stopPropagation(); // window-level fallback 의 중복 dispatch 차단
    }
  }, [mode, dispatch]);

  // window-level fallback — focus 가 row 밖에 있을 때도 history 단축키가 동작하도록.
  // 단, 텍스트 입력 중 (DOM 포커스가 입력 필드면) 은 row 의 onKeyDown 이 처리.
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && target.closest('input, textarea, [contenteditable="true"]')) return;
      if (e.isComposing || e.keyCode === 229) return;
      const chord = eventToChord(e);
      const id = findCommand(chord, mode);
      if (!id) return;
      const handled = dispatch(id);
      if (handled) e.preventDefault();
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [mode, dispatch]);

  // 클릭 정책:
  //   click on text       → focus + edit mode
  //   click on bullet     → focus + select mode (mode 전환만)
  //   shift+click         → range select + select mode
  //   meta+click          → toggle + select mode
  const onClickText = useCallback((e: React.MouseEvent, p: Pointer) => {
    if (!doc.selection || !doc.focus) return;
    const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform);
    const meta = isMac ? e.metaKey : e.ctrlKey;
    if (e.shiftKey && doc.selection.anchor) {
      e.preventDefault();
      doc.selection.range(doc.selection.anchor, p);
      doc.focus.set(p);
      setMode("select");
    } else if (meta) {
      e.preventDefault();
      doc.selection.toggle(p);
      doc.focus.set(p);
      setMode("select");
    } else {
      doc.selection.set([p]);
      doc.focus.set(p);
      setMode("select");
    }
  }, [doc]);

  const onClickBullet = useCallback((e: React.MouseEvent, p: Pointer) => {
    if (!doc.selection || !doc.focus) return;
    e.preventDefault();
    doc.selection.set([p]);
    doc.focus.set(p);
    setMode("select");
  }, [doc]);

  return (
    <div className="app">
      <header>
        <h1>zod-crud outliner</h1>
        <div className="tag">Workflowy 모델 · select mode ↔ edit mode</div>
      </header>

      <div className="toolbar">
        <button onClick={() => doc.history.undo()} disabled={!doc.history.canUndo}>undo</button>
        <button onClick={() => doc.history.redo()} disabled={!doc.history.canRedo}>redo</button>
        <button onClick={() => { doc.ops.reset(); setMode("select"); }}>reset</button>
        <span className="status">
          mode = <code className={`mode mode-${mode}`}>{mode}</code>
          {" · "}
          focus = <code>{doc.focus?.value ?? "—"}</code>
          {" · "}
          selection = <code>{doc.selection?.values.length ?? 0}</code>
          {" · "}
          clipboard = <code>{clipboard.mode === "empty" ? "—" : `${clipboard.mode} ${clipboard.values.length}`}</code>
        </span>
      </div>

      <ul role="tree" aria-label="outline" aria-multiselectable className="tree" onKeyDown={onKeyDown} tabIndex={-1}>
        <OutlineRow
          node={doc.value}
          pointer=""
          depth={0}
          focus={doc.focus?.value ?? null}
          selection={doc.selection?.values ?? []}
          mode={mode}
          onClickText={onClickText}
          onClickBullet={onClickBullet}
          onKeyDown={onKeyDown}
          ops={doc.ops}
          onTextEdit={onTextEdit}
        />
      </ul>

      <details className="keymap">
        <summary>Keymap ({KEYMAP.length} bindings)</summary>
        <table>
          <tbody>
            {KEYMAP.map((b, i) => (
              <tr key={`${b.chord}-${b.command}-${i}`}>
                <td><kbd>{b.chord}</kbd></td>
                <td>{b.label}</td>
                <td className="cmd"><code>{b.command}</code></td>
                <td className="modes">{b.modes.join(" / ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>

      <div className="toasts" role="status" aria-live="polite">
        {errors.map((m) => (
          <div
            key={m.id}
            className={`toast toast-${m.level}`}
            onClick={() => dismissToast(m.id)}
            title="클릭해서 닫기"
          >
            {m.text}
          </div>
        ))}
      </div>
    </div>
  );
}

interface RowProps {
  node: OutlineNode;
  pointer: Pointer;
  depth: number;
  focus: Pointer | null;
  selection: ReadonlyArray<Pointer>;
  mode: Mode;
  onClickText: (e: React.MouseEvent, p: Pointer) => void;
  onClickBullet: (e: React.MouseEvent, p: Pointer) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  ops: ReturnType<typeof useJsonDocument<typeof OutlineSchema>>["ops"];
  onTextEdit: (path: string) => void;
}

function OutlineRow(props: RowProps) {
  const { node, pointer, depth, focus, selection, mode, onClickText, onClickBullet, onKeyDown, ops, onTextEdit } = props;
  const textPath = `${pointer}/text`;
  const isFocused = pointer === focus;
  const isSelected = selection.includes(pointer);
  const isEditing = isFocused && mode === "edit";
  const ref = useRef<HTMLInputElement>(null);

  // focus 한 row 의 input 은 항상 DOM focus 를 가진다 — keydown 이 그 input 에서 시작되어야
  // chord 디스패처가 동작. 모드는 readOnly 로만 구분.
  useEffect(() => {
    if (!isFocused || !ref.current) return;
    if (document.activeElement !== ref.current) ref.current.focus();
    if (isEditing) {
      const len = ref.current.value.length;
      ref.current.setSelectionRange(len, len);
    }
  }, [isFocused, isEditing]);

  const isRoot = pointer === "";

  return (
    <>
      {!isRoot && (
        <li
          role="treeitem"
          aria-selected={isSelected || isFocused}
          aria-level={depth}
          className={`row ${isSelected ? "selected" : ""} ${isFocused ? "focused" : ""} ${isEditing ? "editing" : ""}`}
          style={{ paddingLeft: `${depth * 1.25}rem` }}
        >
          <span
            aria-hidden
            className="marker"
            onMouseDown={(e) => onClickBullet(e, pointer)}
          >
            {node.children.length > 0 ? "▾" : "•"}
          </span>
          <input
            ref={ref}
            value={node.text}
            readOnly={!isEditing}
            onChange={(e) => { ops.patch([{ op: "replace", path: textPath, value: e.target.value }]); onTextEdit(textPath); }}
            onKeyDown={onKeyDown}
            onMouseDown={(e) => onClickText(e, pointer)}
            placeholder="(empty)"
            className="text"
          />
        </li>
      )}
      {isRoot && (
        <li role="presentation" className="root-title">
          <input
            value={node.text}
            onChange={(e) => { ops.patch([{ op: "replace", path: textPath, value: e.target.value }]); onTextEdit(textPath); }}
            className="text root-text"
          />
        </li>
      )}
      {node.children.map((child, i) => (
        <OutlineRow
          key={`${pointer}/children/${i}`}
          node={child}
          pointer={`${pointer}/children/${i}`}
          depth={depth + 1}
          focus={focus}
          selection={selection}
          mode={mode}
          onClickText={onClickText}
          onClickBullet={onClickBullet}
          onKeyDown={onKeyDown}
          ops={ops}
          onTextEdit={onTextEdit}
        />
      ))}
    </>
  );
}
