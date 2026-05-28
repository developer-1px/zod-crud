import { useEffect, useMemo, useRef, useState } from "react";
import { useJSONDocument } from "zod-crud/react";
import {
  arrayPointerOf,
  createNode,
  flattenOutline,
  indexOf,
  parentNodePointer,
  type FlatNode,
} from "./outline";
import { initialOutline, OutlineSchema } from "./schema";
import "./styles.css";

const rekey = { fields: ["id"], strategy: "suffix" as const };

export function App() {
  const doc = useJSONDocument(OutlineSchema, initialOutline, {
    history: 100,
    selection: true,
  });
  const rows = useMemo(() => flattenOutline(doc.value), [doc.value]);
  const [selectedId, setSelectedId] = useState(rows[0]?.node.id ?? "");
  const inputRefs = useRef(new Map<string, HTMLInputElement>());
  const selected = rows.find((row) => row.node.id === selectedId) ?? rows[0];

  useEffect(() => {
    if (!selected) return;
    doc.selection?.selectRanges([selected.pointer]);
  }, [doc.selection, selected?.pointer]);

  useEffect(() => {
    if (!selected) return;
    inputRefs.current.get(selected.node.id)?.focus();
  }, [selected?.node.id]);

  function select(row: FlatNode) {
    setSelectedId(row.node.id);
    doc.selection?.selectRanges([row.pointer]);
  }

  function patchText(row: FlatNode, text: string) {
    doc.replace(`${row.pointer}/text`, text);
  }

  function addSibling(row: FlatNode) {
    const nextIndex = row.index + 1;
    const inserted = createNode("");
    doc.insert(`${row.parentArrayPointer}/${nextIndex}`, inserted);
    setSelectedId(inserted.id);
  }

  function duplicate(row: FlatNode) {
    const result = doc.duplicate(row.pointer, { rekey });
    if (result.ok) {
      const nextRows = flattenOutline(result.value);
      const duplicateRow = nextRows.find(
        (candidate) => candidate.parentArrayPointer === row.parentArrayPointer && candidate.index === row.index + 1,
      );
      if (duplicateRow) setSelectedId(duplicateRow.node.id);
    }
  }

  function indent(row: FlatNode) {
    const previous = rows.find(
      (candidate) => candidate.parentArrayPointer === row.parentArrayPointer && candidate.index === row.index - 1,
    );
    if (!previous) return;

    doc.move(row.pointer, `${previous.pointer}/children/-`);
    setSelectedId(row.node.id);
  }

  function outdent(row: FlatNode) {
    const parentPointer = parentNodePointer(row.parentArrayPointer);
    if (!parentPointer) return;

    const grandArrayPointer = arrayPointerOf(parentPointer);
    const parentIndex = indexOf(parentPointer);
    doc.move(row.pointer, `${grandArrayPointer}/${parentIndex + 1}`);
    setSelectedId(row.node.id);
  }

  function moveUp(row: FlatNode) {
    if (row.index === 0) return;
    doc.move(row.pointer, `${row.parentArrayPointer}/${row.index - 1}`);
    setSelectedId(row.node.id);
  }

  function moveDown(row: FlatNode) {
    const siblingCount = rows.filter((candidate) => candidate.parentArrayPointer === row.parentArrayPointer).length;
    if (row.index >= siblingCount - 1) return;
    doc.move(row.pointer, `${row.parentArrayPointer}/${row.index + 2}`);
    setSelectedId(row.node.id);
  }

  function moveSelection(offset: -1 | 1) {
    if (!selected) return;
    const index = rows.findIndex((row) => row.node.id === selected.node.id);
    const next = rows[index + offset];
    if (next) select(next);
  }

  function copy(row: FlatNode) {
    doc.clipboard.copy([row.pointer]);
  }

  function cut(row: FlatNode) {
    const nextSelection = rows[row.index + 1] ?? rows[row.index - 1] ?? rows[0];
    const result = doc.clipboard.cut([row.pointer]);
    if (result.ok && nextSelection) setSelectedId(nextSelection.node.id);
  }

  function pasteAfter(row: FlatNode) {
    const result = doc.clipboard.paste(`${row.parentArrayPointer}/${row.index + 1}`, { spread: true, rekey });
    if (result.ok) {
      const nextRows = flattenOutline(result.value);
      const pasted = nextRows.find(
        (candidate) => candidate.parentArrayPointer === row.parentArrayPointer && candidate.index === row.index + 1,
      );
      if (pasted) setSelectedId(pasted.node.id);
    }
  }

  function undo() {
    if (doc.canUndo().ok) doc.history.undo();
  }

  function redo() {
    if (doc.canRedo().ok) doc.history.redo();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>, row: FlatNode) {
    const mod = event.metaKey || event.ctrlKey;

    if (event.key === "Enter") {
      event.preventDefault();
      addSibling(row);
    } else if (event.key === "Tab") {
      event.preventDefault();
      event.shiftKey ? outdent(row) : indent(row);
    } else if (event.altKey && event.key === "ArrowUp") {
      event.preventDefault();
      moveUp(row);
    } else if (event.altKey && event.key === "ArrowDown") {
      event.preventDefault();
      moveDown(row);
    } else if (!mod && !event.altKey && event.key === "ArrowUp") {
      event.preventDefault();
      moveSelection(-1);
    } else if (!mod && !event.altKey && event.key === "ArrowDown") {
      event.preventDefault();
      moveSelection(1);
    } else if (mod && event.key.toLowerCase() === "d") {
      event.preventDefault();
      duplicate(row);
    } else if (mod && event.key.toLowerCase() === "c") {
      event.preventDefault();
      copy(row);
    } else if (mod && event.key.toLowerCase() === "x") {
      event.preventDefault();
      cut(row);
    } else if (mod && event.key.toLowerCase() === "v") {
      event.preventDefault();
      pasteAfter(row);
    } else if (mod && event.key.toLowerCase() === "z") {
      event.preventDefault();
      event.shiftKey ? redo() : undo();
    } else if (mod && event.key.toLowerCase() === "y") {
      event.preventDefault();
      redo();
    }
  }

  return (
    <main className="shell" aria-label="Outliner">
      <div className="bar">
        <button type="button" onClick={() => selected && addSibling(selected)}>
          +
        </button>
        <button type="button" onClick={() => selected && indent(selected)}>
          &gt;
        </button>
        <button type="button" onClick={() => selected && outdent(selected)}>
          &lt;
        </button>
        <button type="button" onClick={() => selected && moveUp(selected)}>
          up
        </button>
        <button type="button" onClick={() => selected && moveDown(selected)}>
          down
        </button>
        <button type="button" onClick={() => selected && duplicate(selected)}>
          dup
        </button>
        <button type="button" onClick={undo} disabled={!doc.canUndo().ok}>
          undo
        </button>
        <button type="button" onClick={redo} disabled={!doc.canRedo().ok}>
          redo
        </button>
      </div>

      <ol className="outline" role="tree" aria-label="Outline">
        {rows.map((row) => (
          <li
            aria-selected={row.node.id === selected?.node.id}
            className="row"
            key={row.node.id}
            role="treeitem"
            style={{ paddingLeft: `${row.depth * 1.25}rem` }}
          >
            <span className="dot" aria-hidden="true" />
            <input
              aria-label={`Node ${row.index + 1}`}
              ref={(input) => {
                if (input) inputRefs.current.set(row.node.id, input);
                else inputRefs.current.delete(row.node.id);
              }}
              value={row.node.text}
              onChange={(event) => patchText(row, event.target.value)}
              onFocus={() => select(row)}
              onKeyDown={(event) => onKeyDown(event, row)}
            />
          </li>
        ))}
      </ol>

      <output className="status">{doc.selection?.primaryPointer ?? selected?.pointer}</output>
    </main>
  );
}
