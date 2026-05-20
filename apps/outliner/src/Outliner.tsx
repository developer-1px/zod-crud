// Outliner — Workflowy 모델: select / edit mode 분리.
// useJSONDocument facade + outliner-local clipboard·keymap·commands 를 hook 들로 묶음.

import { useCallback, useState } from "react";
import { useJSONDocument } from "zod-crud/react";
import { OutlineSchema, SAMPLE } from "./schema.js";
import { OutlineRow } from "./OutlineRow.js";
import { eventToChord, findCommand, KEYMAP, type Mode } from "./keymap.js";
import { useClipboard } from "./clipboard.js";
import { useToasts } from "./hooks/useToasts.js";
import { useTextEditCoalesce } from "./hooks/useTextEditCoalesce.js";
import { useDispatch } from "./hooks/useDispatch.js";
import { useGlobalKey } from "./hooks/useGlobalKey.js";
import { useClickPolicy } from "./hooks/useClickPolicy.js";
import { useRecorderUI } from "./hooks/useRecorderUI.js";
import { useDebugUI } from "./hooks/useDebugUI.js";

export function Outliner() {
  const [mode, setMode] = useState<Mode>("select");
  const { errors, pushToast, dismissToast, onError } = useToasts();
  const doc = useJSONDocument(OutlineSchema, SAMPLE, {
    history: 200, strict: false, onError,
    selection: { mode: "extended", initial: [""] },
  });
  const clipboard = useClipboard();
  const onTextEdit = useTextEditCoalesce(doc.history.mergeLast);

  const recorder = useRecorderUI(doc.ops);
  const debug = useDebugUI(doc.ops, doc.selection);
  const logger = { enabled: debug.enabled, log: debug.log };
  const toggleRecord = useCallback(() => {
    if (recorder.isRecording) recorder.stopAndShare();
    else recorder.start();
  }, [recorder]);

  const ctx = doc.selection
    ? { state: doc.value, ops: doc.ops, selection: doc.selection, clipboard }
    : null;
  const dispatch = useDispatch({
    ctx, mode, setMode, pushToast,
    undo: doc.commands.undo, redo: doc.commands.redo,
    toggleRecord,
    logger,
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
  const { onClickText, onClickBullet } = useClickPolicy(doc.selection, setMode, logger);

  return (
    <div className="app">
      <header>
        <h1>zod-crud outliner</h1>
      </header>

      <div className="toolbar">
        <button onClick={doc.commands.undo} disabled={!doc.history.canUndo}>undo</button>
        <button onClick={doc.commands.redo} disabled={!doc.history.canRedo}>redo</button>
        <button onClick={() => { doc.ops.reset(); setMode("select"); }}>reset</button>
        <span className="status">
          mode = <code className={`mode mode-${mode}`}>{mode}</code>
          {" · "}focus = <code>{doc.selection?.focusPointer ?? "—"}</code>
          {" · "}selection = <code>{doc.selection?.selectedPointers.length ?? 0}</code>
          {" · "}clipboard = <code>{clipboard.mode === "empty" ? "—" : `${clipboard.mode} ${clipboard.values.length}`}</code>
        </span>
      </div>

      <ul role="tree" aria-label="outline" aria-multiselectable className="tree" onKeyDown={onKeyDown} tabIndex={-1}>
        <OutlineRow
          node={doc.value} pointer="" depth={0}
          focus={doc.selection?.focusPointer ?? null}
          selection={doc.selection?.selectedPointers ?? []}
          mode={mode}
          onClickText={onClickText} onClickBullet={onClickBullet}
          onKeyDown={onKeyDown} ops={doc.ops} onTextEdit={onTextEdit}
        />
      </ul>

      <details className="dev-tools">
        <summary>dev</summary>
        {recorder.isRecording ? (
          <button
            onClick={() => recorder.stopAndShare()}
            title="Stop recording and download JSON"
            style={{ color: "#c33", fontWeight: 600 }}
          >
            stop record ({recorder.stepCount})
          </button>
        ) : (
          <button onClick={recorder.start} title="Record patches from this state">record</button>
        )}
        <button onClick={recorder.loadAndReplay} disabled={recorder.replaying} title="Replay JSON recording">
          {recorder.replaying ? "replaying" : "replay"}
        </button>
        {debug.enabled ? (
          <button
            onClick={() => debug.stopAndShare()}
            title="Stop debug log and download JSON"
            style={{ color: "#06c", fontWeight: 600 }}
          >
            stop debug ({debug.eventCount})
          </button>
        ) : (
          <button onClick={debug.start} title="Record input, dispatch, commit, and selection traces">
            debug
          </button>
        )}
      </details>

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
