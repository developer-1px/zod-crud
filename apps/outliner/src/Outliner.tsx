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

  // command 디스패치 — keymap 의 CommandId 를 받아 실행. mode 전환은 여기서 처리.
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
      // mode 전환
      case "enter-edit":     setMode("edit"); return;
      case "exit-edit":      setMode("select"); return;

      // insert-sibling 후 새 row 는 edit mode (workflowy)
      case "insert-sibling": cmd.insertSibling(ctx); setMode("edit"); return;

      // remove-if-empty: edit 모드에서 빈 텍스트일 때만 row 제거 → select 로 escape
      case "remove-if-empty": {
        const f = doc.focus.value;
        if (f === null) return;
        const node = readNode(doc.value, f);
        if (node && node.text === "") {
          cmd.remove(ctx);
          setMode("select");
        }
        return;
      }

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

  // 키보드 dispatcher — chord + 현재 mode 로 lookup.
  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    const chord = eventToChord(e);
    const id = findCommand(chord, mode);
    if (!id) return;
    e.preventDefault();
    dispatch(id);
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
      setMode("edit");
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

      <ul role="tree" aria-label="outline" aria-multiselectable className="tree">
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
  mode: Mode;
  onClickText: (e: React.MouseEvent, p: Pointer) => void;
  onClickBullet: (e: React.MouseEvent, p: Pointer) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  ops: ReturnType<typeof useJsonDocument<typeof OutlineSchema>>["ops"];
}

function OutlineRow(props: RowProps) {
  const { node, pointer, depth, focus, selection, mode, onClickText, onClickBullet, onKeyDown, ops } = props;
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
            onChange={(e) => ops.patch([{ op: "replace", path: textPath, value: e.target.value }])}
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
            onChange={(e) => ops.patch([{ op: "replace", path: textPath, value: e.target.value }])}
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
        />
      ))}
    </>
  );
}
