import { useMemo } from "react";
import type { Pointer } from "zod-crud";
import { useJSONDocument } from "zod-crud/react";
import {
  addChild,
  addSibling,
  copyNode,
  cutNode,
  demote,
  duplicateNode,
  findRow,
  flattenOutline,
  initialOutline,
  moveDown,
  moveUp,
  OutlineSchema,
  pasteAfter,
  promote,
  selectNode,
  updateNodeText,
} from "./outlinerModel";

export function App() {
  const doc = useJSONDocument(OutlineSchema, initialOutline, { history: 100, selection: true });
  const rows = useMemo(() => flattenOutline(doc.value.nodes), [doc.value.nodes]);
  const selectedPointer = doc.selection?.primaryPointer as Pointer | undefined;
  const selectedRow = selectedPointer ? findRow(doc.value, selectedPointer) : undefined;

  function select(pointer: Pointer) {
    selectNode(doc, pointer);
  }

  function withSelection(action: (pointer: Pointer) => void) {
    if (selectedPointer) action(selectedPointer);
  }

  return (
    <main className="shell">
      <header className="topbar">
        <h1>{doc.value.title}</h1>
        <div className="toolbar" aria-label="Outline toolbar">
          <button type="button" onClick={() => selectedRow && addSibling(doc, selectedRow)} disabled={!selectedRow}>
            Sibling
          </button>
          <button type="button" onClick={() => selectedPointer && addChild(doc, selectedPointer)} disabled={!selectedPointer}>
            Child
          </button>
          <button type="button" onClick={() => selectedPointer && duplicateNode(doc, selectedPointer)} disabled={!selectedPointer}>
            Duplicate
          </button>
          <button type="button" onClick={() => withSelection((pointer) => copyNode(doc, pointer))} disabled={!selectedPointer}>
            Copy
          </button>
          <button type="button" onClick={() => withSelection((pointer) => cutNode(doc, pointer))} disabled={!selectedPointer}>
            Cut
          </button>
          <button
            type="button"
            onClick={() => selectedPointer && pasteAfter(doc, selectedPointer)}
            disabled={!selectedPointer || !doc.canPaste({ after: selectedPointer }).ok}
          >
            Paste
          </button>
          <button type="button" onClick={() => selectedRow && moveUp(doc, selectedRow)} disabled={!selectedRow || selectedRow.index === 0}>
            Up
          </button>
          <button type="button" onClick={() => selectedRow && moveDown(doc, selectedRow)} disabled={!selectedRow}>
            Down
          </button>
          <button type="button" onClick={() => selectedRow && promote(doc, selectedRow)} disabled={!selectedRow || selectedRow.parentPointer === "/nodes"}>
            Promote
          </button>
          <button type="button" onClick={() => selectedRow && demote(doc, selectedRow)} disabled={!selectedRow || selectedRow.index === 0}>
            Demote
          </button>
          <button type="button" onClick={() => doc.history.undo()} disabled={!doc.canUndo().ok}>
            Undo
          </button>
          <button type="button" onClick={() => doc.history.redo()} disabled={!doc.canRedo().ok}>
            Redo
          </button>
        </div>
      </header>

      <section className="outline" aria-label="Outline">
        {rows.map((row) => (
          <div
            className={row.pointer === selectedPointer ? "row selected" : "row"}
            key={row.node.id}
            style={{ "--depth": row.depth } as React.CSSProperties}
            onClick={() => select(row.pointer)}
          >
            <button className="handle" type="button" aria-label="Select node" onClick={() => select(row.pointer)}>
              {row.pointer === selectedPointer ? "●" : "○"}
            </button>
            <input
              aria-label="Node text"
              value={row.node.text}
              onFocus={() => select(row.pointer)}
              onChange={(event) => updateNodeText(doc, row.pointer, event.target.value)}
            />
          </div>
        ))}
      </section>
    </main>
  );
}
