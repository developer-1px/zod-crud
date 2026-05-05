import { useEffect, useState } from "react";
import { z } from "zod";
import { createJsonCrud } from "zod-crud";
import { useListboxPattern } from "@p/headless/patterns";
import type { NormalizedData } from "@p/headless";

const Schema = z.object({ status: z.enum(["todo", "doing", "done"]) });

export function ExampleListbox() {
  const [crud] = useState(() => createJsonCrud(Schema, { status: "todo" }));
  const [doc, setDoc] = useState(() => crud.snapshot());
  useEffect(() => crud.subscribe(() => setDoc(crud.snapshot())), [crud]);
  const statusId = crud.find(doc.rootId, "status")!;
  const current = doc.nodes[statusId]!.value as string;
  const options = Schema.shape.status.options;

  const data: NormalizedData = {
    entities: Object.fromEntries(
      options.map((id) => [id, { label: id, selected: id === current }]),
    ),
    relationships: {},
    meta: { root: options.slice(), focus: current },
  };

  const { rootProps, optionProps, items } = useListboxPattern(
    data,
    (e) => {
      if (e.type === "select") crud.update(statusId, e.id);
    },
    { label: "Status" },
  );

  return (
    <ul {...rootProps} className="example-listbox">
      {items.map((it) => (
        <li key={it.id} {...optionProps(it.id)}>
          {it.label}
        </li>
      ))}
    </ul>
  );
}
