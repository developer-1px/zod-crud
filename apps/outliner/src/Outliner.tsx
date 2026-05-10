// Outliner — useJsonDocument facade + outliner-local clipboard·keymap·commands.
// 5축 (keyboard, focus cursor, multi-select, copy/cut/paste, error UX) 모두 구현.

import { useCallback, useEffect, useRef, useState } from "react";
import { useJsonDocument, type Pointer, type JsonCrudError } from "zod-crud";
import { OutlineSchema, SAMPLE, type OutlineNode } from "./schema.js";
import { eventToChord, findCommand, KEYMAP, type CommandId } from "./keymap.js";
import { useClipboard } from "./clipboard.js";
import * as cmd from "./commands.js";

interface ToastMessage {
  id: number;
  level: "error" | "info";
  text: string;
}

let toastSeq = 0;

export function Outliner() {
  const [errors, setErrors] = useState<ToastMessage[]>([]);

  const pushToast = useCallback((level: "error" | "info", text: string) => {
    const id = ++toastSeq;
    setErrors((prev) => [...prev, { id, level, text }]);
    setTimeout(() => setErrors((prev) => prev.filter((m) => m.id !== id)), 2500);
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

  // command 디스패치 — keymap 의 CommandId 를 받아 commands/* 함수 호출.
  const dispatch = useCallback((id: CommandId): void => {
    if (!doc.selection || !doc.focus) return;
    const ctx = {
      state: doc.value,
      ops: doc.ops,
      selection: doc.selection,
      focus: doc.focus,
      clipboard,
    };
    switch (id) {
      case "insert-sibling": cmd.insertSibling(ctx); return;
      case "demote":         cmd.demote(ctx); return;
      case "promote":        cmd.promote(ctx); return;
      case "remove":         cmd.remove(ctx); return;
      case "select-all":     cmd.selectAll(ctx); return;
      case "focus-prev":     cmd.focusPrev(ctx); return;
      case "focus-next":     cmd.focusNext(ctx); return;
      case "focus-parent":   cmd.focusParent(ctx); return;
      case "focus-first-child": cmd.focusFirstChild(ctx); return;
      case "focus-first":    cmd.focusFirst(ctx); return;
      case "focus-last":     cmd.focusLast(ctx); return;
      case "extend-up":      cmd.extendSelection(ctx, "up"); return;
      case "extend-down":    cmd.extendSelection(ctx, "down"); return;
      case "move-up":        cmd.moveUp(ctx); return;
      case "move-down":      cmd.moveDown(ctx); return;
      case "copy":           cmd.copy(ctx); pushToast("info", `Copied ${ctx.selection.values.length || 1}`); return;
      case "cut":            cmd.cut(ctx); pushToast("info", `Cut ${ctx.selection.values.length || 1}`); return;
      case "paste-sibling":  cmd.paste(ctx, "sibling"); return;
      case "paste-child":    cmd.paste(ctx, "child"); return;
      case "undo":           doc.history.undo(); return;
      case "redo":           doc.history.redo(); return;
    }
  }, [doc, clipboard, pushToast]);

  // 키보드 dispatcher — DOM 이벤트 → chord → command.
  // Backspace 는 empty 일 때만 remove (data-driven UX 분기).
  const onKeyDown = useCallback((e: React.KeyboardEvent, p: Pointer) => {
    const chord = eventToChord(e);

    // Backspace 특수: text 가 비어있을 때만 remove
    if (chord === "Backspace") {
      const node = (function findNode(root: OutlineNode, pointer: Pointer): OutlineNode | null {
        if (pointer === "") return root;
        const seg = pointer.split("/").slice(1);
        let cur: OutlineNode | undefined = root;
        for (let i = 0; i < seg.length; i++) {
          const k = seg[i]!;
          if (!cur) return null;
          if (k === "children") cur = cur.children[Number(seg[++i])];
        }
        return cur ?? null;
      })(doc.value, p);
      if (node && node.text === "") {
        e.preventDefault();
        dispatch("remove");
      }
      return;
    }

    const id = findCommand(chord);
    if (!id) return;
    e.preventDefault();
    dispatch(id);
  }, [doc.value, dispatch]);

  // 클릭 핸들러 — 단일/Shift/Cmd 분기.
  const onClickRow = useCallback((e: React.MouseEvent, p: Pointer) => {
    if (!doc.selection || !doc.focus) return;
    const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform);
    const meta = isMac ? e.metaKey : e.ctrlKey;
    if (e.shiftKey && doc.selection.anchor) {
      doc.selection.range(doc.selection.anchor, p);
      doc.focus.set(p);
    } else if (meta) {
      doc.selection.toggle(p);
      doc.focus.set(p);
    } else {
      doc.selection.set([p]);
      doc.focus.set(p);
    }
  }, [doc]);

  return (
    <div className="app">
      <header>
        <h1>zod-crud outliner</h1>
        <div className="tag">useJsonDocument · Axis 1+2 · multi-select · clipboard · history</div>
      </header>

      <div className="toolbar">
        <button onClick={() => doc.history.undo()} disabled={!doc.history.canUndo}>undo</button>
        <button onClick={() => doc.history.redo()} disabled={!doc.history.canRedo}>redo</button>
        <button onClick={() => doc.ops.reset()}>reset</button>
        <span className="status">
          focus = <code>{doc.focus?.value ?? "—"}</code>
          {" · "}
          selection = <code>{doc.selection?.values.length ?? 0}</code>
          {" · "}
          clipboard = <code>{clipboard.mode === "empty" ? "—" : `${clipboard.mode} ${clipboard.values.length}`}</code>
        </span>
      </div>

      <ul role="tree" aria-label="outline" aria-multiselectable className="tree">
        <OutlineRow
          node={doc.value}
          pointer=""
          depth={0}
          focus={doc.focus?.value ?? null}
          selection={doc.selection?.values ?? []}
          onKeyDown={onKeyDown}
          onClickRow={onClickRow}
          ops={doc.ops}
          onTextFocus={(p) => {
            if (!doc.selection || !doc.focus) return;
            doc.focus.set(p);
            // 텍스트 편집 진입 시 multi-selection 은 해제하지 않음 (anchor 유지)
          }}
        />
      </ul>

      <details className="keymap">
        <summary>Keymap ({KEYMAP.length} bindings)</summary>
        <table>
          <tbody>
            {KEYMAP.map((b) => (
              <tr key={`${b.chord}-${b.command}`}>
                <td><kbd>{b.chord}</kbd></td>
                <td>{b.label}</td>
                <td className="cmd"><code>{b.command}</code></td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>

      <div className="toasts" role="status" aria-live="polite">
        {errors.map((m) => (
          <div key={m.id} className={`toast toast-${m.level}`}>{m.text}</div>
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
  onKeyDown: (e: React.KeyboardEvent, p: Pointer) => void;
  onClickRow: (e: React.MouseEvent, p: Pointer) => void;
  ops: ReturnType<typeof useJsonDocument<typeof OutlineSchema>>["ops"];
  onTextFocus: (p: Pointer) => void;
}

function OutlineRow(props: RowProps) {
  const { node, pointer, depth, focus, selection, onKeyDown, onClickRow, ops, onTextFocus } = props;
  const textPath = `${pointer}/text`;
  const isFocused = pointer === focus;
  const isSelected = selection.includes(pointer);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (isFocused) ref.current?.focus(); }, [isFocused]);

  return (
    <>
      {pointer !== "" && (
        <li
          role="treeitem"
          aria-selected={isSelected || isFocused}
          aria-level={depth}
          className={`row ${isSelected ? "selected" : ""} ${isFocused ? "focused" : ""}`}
          style={{ paddingLeft: `${depth * 1.25}rem` }}
          onMouseDown={(e) => onClickRow(e, pointer)}
        >
          <span aria-hidden className="marker">
            {node.children.length > 0 ? "▾" : "•"}
          </span>
          <input
            ref={ref}
            value={node.text}
            onChange={(e) => ops.patch([{ op: "replace", path: textPath, value: e.target.value }])}
            onFocus={() => onTextFocus(pointer)}
            onKeyDown={(e) => onKeyDown(e, pointer)}
            placeholder="(empty)"
            className="text"
          />
        </li>
      )}
      {pointer === "" && (
        // root: text 보여주되 row UI 는 다르게 (제목)
        <li role="presentation" className="root-title">
          <input
            value={node.text}
            onChange={(e) => ops.patch([{ op: "replace", path: textPath, value: e.target.value }])}
            onKeyDown={(e) => onKeyDown(e, pointer)}
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
          onKeyDown={onKeyDown}
          onClickRow={onClickRow}
          ops={ops}
          onTextFocus={onTextFocus}
        />
      ))}
    </>
  );
}
