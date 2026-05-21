// 단일 row 렌더링. focus 인 input 에 DOM focus 강제, mode 별 readOnly.
// keydown 은 props 로 받는다 — chord dispatcher 는 부모 책임.

import { useEffect, useRef } from "react";
import type { Pointer } from "zod-crud";
import { useJSONDocument } from "zod-crud/react";
import type { OutlineNode, OutlineSchema } from "./schema.js";
import type { Mode } from "./keymap.js";

export interface RowProps {
  node: OutlineNode;
  pointer: Pointer;
  depth: number;
  focus: Pointer | null;
  selection: ReadonlyArray<Pointer>;
  mode: Mode;
  onClickText: (e: React.MouseEvent, p: Pointer) => void;
  onClickBullet: (e: React.MouseEvent, p: Pointer) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  ops: ReturnType<typeof useJSONDocument<typeof OutlineSchema>>["ops"];
  onTextEdit: (path: string) => void;
}

export function OutlineRow(props: RowProps) {
  const { node, pointer, depth, focus, selection, mode, onClickText, onClickBullet, onKeyDown, ops, onTextEdit } = props;
  const textPath = `${pointer}/text`;
  const isFocused = pointer === focus;
  const isSelected = selection.includes(pointer);
  const isEditing = isFocused && mode === "edit";
  const ref = useRef<HTMLInputElement>(null);

  // focus 한 row 의 input 은 항상 DOM focus — chord dispatcher 가 그 input 에서 시작되도록.
  useEffect(() => {
    if (!isFocused || !ref.current) return;
    if (document.activeElement !== ref.current) ref.current.focus();
    if (isEditing) {
      const len = ref.current.value.length;
      ref.current.setSelectionRange(len, len);
    }
  }, [isFocused, isEditing]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    ops.patch([{ op: "replace", path: textPath, value: e.target.value }]);
    onTextEdit(textPath);
  };

  const isRoot = pointer === "";

  return (
    <>
      {isRoot ? (
        <li role="presentation" className="root-title">
          <input value={node.text} onChange={handleChange} className="text root-text" />
        </li>
      ) : (
        <li
          role="treeitem"
          aria-selected={isSelected || isFocused}
          aria-level={depth}
          className={`row ${isSelected ? "selected" : ""} ${isFocused ? "focused" : ""} ${isEditing ? "editing" : ""}`}
          style={{ paddingLeft: `${depth * 1.25}rem` }}
        >
          <span aria-hidden className="marker" onMouseDown={(e) => onClickBullet(e, pointer)}>
            {node.children.length > 0 ? "▾" : "•"}
          </span>
          <input
            ref={ref}
            value={node.text}
            readOnly={!isEditing}
            onChange={handleChange}
            onKeyDown={onKeyDown}
            onMouseDown={(e) => onClickText(e, pointer)}
            placeholder="(empty)"
            className="text"
          />
        </li>
      )}
      {node.children.map((child, i) => (
        <OutlineRow
          key={`${pointer}/children/${i}`}
          {...props}
          node={child}
          pointer={`${pointer}/children/${i}`}
          depth={depth + 1}
        />
      ))}
    </>
  );
}
