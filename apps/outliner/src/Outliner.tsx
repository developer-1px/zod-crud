// Outliner — Workflowy 모델: select / edit mode 분리.
// useJSONDocument facade + outliner-local clipboard·keymap·commands 를 hook 들로 묶음.

import { useCallback, useState } from "react";
import { useJSONDocument } from "zod-crud/react";
import { OutlineSchema, SAMPLE } from "./schema.js";
import { OutlineRow } from "./OutlineRow.js";
import { eventToChord, findCommand, type Mode } from "./keymap.js";
import { useClipboard } from "./clipboard.js";
import { useToasts } from "./hooks/useToasts.js";
import { useTextEditCoalesce } from "./hooks/useTextEditCoalesce.js";
import { useDispatch } from "./hooks/useDispatch.js";
import { useGlobalKey } from "./hooks/useGlobalKey.js";
import { useClickPolicy } from "./hooks/useClickPolicy.js";
import "./outliner.css";

export function Outliner() {
  const [mode, setMode] = useState<Mode>("select");
  const { errors, pushToast, dismissToast, onError } = useToasts();
  const doc = useJSONDocument(OutlineSchema, SAMPLE, {
    history: 200, strict: false, onError,
    selection: { mode: "extended", initial: [""] },
  });
  const clipboard = useClipboard();
  const onTextEdit = useTextEditCoalesce(doc.history.mergeLast);

  const ctx = doc.selection
    ? { state: doc.value, document: doc, selection: doc.selection, clipboard }
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
  const { onClickText, onClickBullet } = useClickPolicy(doc.selection, setMode);

  return (
    <div className="zc-outliner">
      <header>
        <h1>zod-crud outliner</h1>
      </header>

      <div className="zc-outliner-toolbar">
        <button onClick={() => doc.history.undo()} disabled={!doc.history.canUndo}>undo</button>
        <button onClick={() => doc.history.redo()} disabled={!doc.history.canRedo}>redo</button>
        <button onClick={() => { doc.reset(); setMode("select"); }}>reset</button>
        <span className="zc-outliner-status status">
          mode = <code className={`zc-outliner-mode zc-outliner-mode-${mode}`}>{mode}</code>
          {" · "}focus = <code>{doc.selection?.focusPointer ?? "—"}</code>
          {" · "}selection = <code>{doc.selection?.selectedPointers.length ?? 0}</code>
          {" · "}clipboard = <code>{clipboard.mode === "empty" ? "—" : `${clipboard.mode} ${clipboard.values.length}`}</code>
        </span>
      </div>

      <ul role="tree" aria-label="outline" aria-multiselectable className="zc-outliner-tree" onKeyDown={onKeyDown} tabIndex={-1}>
        <OutlineRow
          node={doc.value} pointer="" depth={0}
          focus={doc.selection?.focusPointer ?? null}
          selection={doc.selection?.selectedPointers ?? []}
          mode={mode}
          onClickText={onClickText} onClickBullet={onClickBullet}
          onKeyDown={onKeyDown} doc={doc} onTextEdit={onTextEdit}
        />
      </ul>

      <div className="zc-outliner-toasts" role="status" aria-live="polite">
        {errors.map((m) => (
          <div key={m.id} className={`zc-outliner-toast zc-outliner-toast-${m.level} toast toast-${m.level}`} onClick={() => dismissToast(m.id)} title="클릭해서 닫기">
            {m.text}
          </div>
        ))}
      </div>
    </div>
  );
}
