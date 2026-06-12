import { useMemo, useState } from "react";
import { createGrouping, type GroupingAdapter, type GroupingChangeResult } from "@interactive-os/json-document-grouping";
import type { Pointer } from "@interactive-os/json-document";
import { useJSONDocument } from "@interactive-os/json-document/react";
import { z } from "zod";
import "./grouping-lab.css";

type Item =
  | { id: string; type: "card"; title: string }
  | { id: string; type: "group"; title: string; children: Item[] };

const ItemSchema: z.ZodType<Item> = z.lazy(() => z.discriminatedUnion("type", [
  z.object({
    id: z.string(),
    type: z.literal("card"),
    title: z.string(),
  }),
  z.object({
    id: z.string(),
    type: z.literal("group"),
    title: z.string(),
    children: z.array(ItemSchema),
  }),
]));

export const BoardSchema = z.object({
  items: z.array(ItemSchema),
});

export const initialBoard: z.output<typeof BoardSchema> = {
  items: [
    { id: "a", type: "card", title: "Intro" },
    { id: "b", type: "card", title: "Draft" },
    { id: "c", type: "card", title: "Review" },
    { id: "d", type: "card", title: "Ship" },
  ],
};

const adapter: GroupingAdapter = {
  isGroup(value) {
    return isRecord(value) && value.type === "group" && Array.isArray(value.children);
  },
  getChildren(value) {
    return isRecord(value) && Array.isArray(value.children) ? value.children : null;
  },
  createGroup(children, context) {
    return {
      id: `group-${context.insertIndex}-${context.source.length}`,
      type: "group",
      title: `Group ${context.source.length}`,
      children,
    };
  },
};

export function App() {
  const doc = useJSONDocument(BoardSchema, initialBoard, { history: 50 });
  const grouping = useMemo(() => createGrouping(doc, adapter), [doc]);
  const [selected, setSelected] = useState<Pointer[]>(["/items/0", "/items/1"]);
  const [message, setMessage] = useState("ready");

  const canGroup = grouping.canGroup(selected);
  const primary = selected[0] ?? "";
  const canUngroup = primary === "" ? noSelection("ungroup") : grouping.canUngroup(primary);

  const select = (pointer: Pointer) => {
    setSelected((current) => (
      current.includes(pointer)
        ? current.filter((item) => item !== pointer)
        : [...current, pointer]
    ));
  };

  const group = () => {
    const result = grouping.group(selected);
    setMessage(label(result));
    if (result.ok) setSelected([...result.selectionAfter]);
  };

  const ungroup = () => {
    if (primary === "") return;
    const result = grouping.ungroup(primary);
    setMessage(label(result));
    if (result.ok) setSelected([...result.selectionAfter]);
  };

  const reset = () => {
    doc.reset();
    setSelected(["/items/0", "/items/1"]);
    setMessage("reset");
  };

  return (
    <main className="grouping-lab">
      <header className="grouping-lab__bar">
        <h1>Grouping lab</h1>
        <div>
          <button type="button" onClick={() => doc.undo()} disabled={!doc.canUndo().ok}>undo</button>
          <button type="button" onClick={() => doc.redo()} disabled={!doc.canRedo().ok}>redo</button>
          <button type="button" onClick={reset}>reset</button>
        </div>
      </header>

      <section className="grouping-lab__layout">
        <aside className="grouping-lab__commands" aria-label="commands">
          <CommandButton label="group" capability={canGroup} onClick={group} />
          <CommandButton label="ungroup" capability={canUngroup} onClick={ungroup} />
          <div aria-label="selection" className="grouping-lab__selection">
            {selected.length === 0 ? <code>none</code> : selected.map((pointer) => <code key={pointer}>{pointer}</code>)}
          </div>
        </aside>

        <ol className="grouping-lab__board" aria-label="items">
          {doc.value.items.map((item, index) => (
            <ItemView
              key={`${item.id}-${index}`}
              item={item}
              pointer={`/items/${index}`}
              selected={selected}
              onSelect={select}
            />
          ))}
        </ol>
      </section>

      <p className="grouping-lab__status" role="status">{message}</p>
    </main>
  );
}

function ItemView(props: {
  item: Item;
  pointer: Pointer;
  selected: ReadonlyArray<Pointer>;
  onSelect(pointer: Pointer): void;
}) {
  const checked = props.selected.includes(props.pointer);
  return (
    <li className={props.item.type === "group" ? "grouping-lab__item is-group" : "grouping-lab__item"}>
      <label>
        <input
          type="checkbox"
          checked={checked}
          onChange={() => props.onSelect(props.pointer)}
          aria-label={props.pointer}
        />
        <span>{props.item.title}</span>
        <code>{props.pointer}</code>
      </label>
      {props.item.type === "group" ? (
        <ol>
          {props.item.children.map((child, index) => (
            <ItemView
              key={`${child.id}-${index}`}
              item={child}
              pointer={`${props.pointer}/children/${index}` as Pointer}
              selected={props.selected}
              onSelect={props.onSelect}
            />
          ))}
        </ol>
      ) : null}
    </li>
  );
}

function CommandButton(props: {
  label: string;
  capability: { ok: boolean; code?: string };
  onClick(): void;
}) {
  return (
    <button type="button" onClick={props.onClick} disabled={!props.capability.ok} aria-label={props.label}>
      <span>{props.label}</span>
      <code>{props.capability.ok ? "ok" : props.capability.code}</code>
    </button>
  );
}

function noSelection(operation: "group" | "ungroup"): GroupingChangeResult {
  return {
    ok: false,
    code: "empty_selection",
    reason: "selection is empty",
    operation,
  };
}

function label(result: { ok: boolean; operation?: string; code?: string }): string {
  return result.ok ? result.operation ?? "ok" : result.code ?? "error";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
