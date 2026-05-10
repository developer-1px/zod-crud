// Outliner — Workflowy 모델: select / edit mode 분리.
// useJsonDocument facade + outliner-local clipboard·keymap·commands 를 hook 들로 묶음.

import { useCallback, useState } from "react";
import { useJsonDocument } from "zod-crud";
import { OutlineSchema, SAMPLE } from "./schema.js";
import { OutlineRow } from "./OutlineRow.js";
import { eventToChord, findCommand, KEYMAP, type Mode } from "./keymap.js";
import { useClipboard } from "./clipboard.js";
import { useToasts } from "./hooks/useToasts.js";
import { useTextEditCoalesce } from "./hooks/useTextEditCoalesce.js";
import { useDispatch } from "./hooks/useDispatch.js";
import { useGlobalKey } from "./hooks/useGlobalKey.js";
import { useClickPolicy } from "./hooks/useClickPolicy.js";

export function Outliner() {
  const [mode, setMode] = useState<Mode>("select");
  const { errors, pushToast, dismissToast, onError } = useToasts();
  const doc = useJsonDocument(OutlineSchema, SAMPLE, {
    history: 200, strict: false, onError,
    selection: { mode: "extended" },
    focus: { initial: "" },
  });
  const clipboard = useClipboard();
  const onTextEdit = useTextEditCoalesce(doc.history.mergeLast);

  const ctx = doc.selection && doc.focus
    ? { state: doc.value, ops: doc.ops, selection: doc.selection, focus: doc.focus, clipboard }
    : null;
  const dispatch = useDispatch({
    ctx, mode, setMode, pushToast,
    undo: doc.history.undo, redo: doc.history.redo,
  });

  // row 의 onKeyDown — chord dispatcher. handled 면 preventDefault + stopPropagation
  // 으로 window-level fallback 의 중복 dispatch 차단.
  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    const id = findCommand(eventToChord(e), mode);
    if (!id) return;
    if (dispatch(id)) { e.preventDefault(); e.stopPropagation(); }
  }, [mode, dispatch]);

  useGlobalKey(mode, dispatch);
  const { onClickText, onClickBullet } = useClickPolicy(doc.selection, doc.focus, setMode);

  return (
    <div className="app">
      <header>
        <h1>zod-crud outliner</h1>
        <div className="tag">Workflowy 모델 · select mode ↔ edit mode</div>
      </header>

      <div className="toolbar">
        <button onClick={doc.history.undo} disabled={!doc.history.canUndo}>undo</button>
        <button onClick={doc.history.redo} disabled={!doc.history.canRedo}>redo</button>
        <button onClick={() => { doc.ops.reset(); setMode("select"); }}>reset</button>
        <span className="status">
          mode = <code className={`mode mode-${mode}`}>{mode}</code>
          {" · "}focus = <code>{doc.focus?.value ?? "—"}</code>
          {" · "}selection = <code>{doc.selection?.values.length ?? 0}</code>
          {" · "}clipboard = <code>{clipboard.mode === "empty" ? "—" : `${clipboard.mode} ${clipboard.values.length}`}</code>
        </span>
      </div>

      <ul role="tree" aria-label="outline" aria-multiselectable className="tree" onKeyDown={onKeyDown} tabIndex={-1}>
        <OutlineRow
          node={doc.value} pointer="" depth={0}
          focus={doc.focus?.value ?? null}
          selection={doc.selection?.values ?? []}
          mode={mode}
          onClickText={onClickText} onClickBullet={onClickBullet}
          onKeyDown={onKeyDown} ops={doc.ops} onTextEdit={onTextEdit}
        />
      </ul>

      <details className="keymap">
        <summary>Keymap ({KEYMAP.length} bindings)</summary>
        <table><tbody>
          {KEYMAP.map((b, i) => (
            <tr key={`${b.chord}-${b.command}-${i}`}>
              <td><kbd>{b.chord}</kbd></td>
              <td>{b.label}</td>
              <td className="cmd"><code>{b.command}</code></td>
              <td className="modes">{b.modes.join(" / ")}</td>
            </tr>
          ))}
        </tbody></table>
      </details>

      <div className="toasts" role="status" aria-live="polite">
        {errors.map((m) => (
          <div key={m.id} className={`toast toast-${m.level}`} onClick={() => dismissToast(m.id)} title="클릭해서 닫기">
            {m.text}
          </div>
        ))}
      </div>
    </div>
  );
}
