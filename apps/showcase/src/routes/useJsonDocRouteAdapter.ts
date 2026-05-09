import { useCallback, useEffect, useMemo, useState } from "react";
import type { UiEvent } from "@p/aria-kernel";
import { createJsonCrud, type NodeId } from "zod-crud";
import { SampleSchema, sampleData } from "./sampleData.js";
import { toNormalized } from "./jsonDocAdapter.js";
import { handleJsonDocCrudEvent } from "./jsonDocRouteCrudEvents.js";
import { handleJsonDocViewEvent } from "./jsonDocRouteViewEvents.js";
import { initialExpandedIds } from "./jsonDocTreeIds.js";

export function useJsonDocRouteAdapter() {
  const [crud] = useState(() => createJsonCrud(SampleSchema, sampleData));
  const [doc, setDoc] = useState(() => crud.snapshot());
  const [expanded, setExpanded] = useState(() => initialExpandedIds(crud.snapshot()));
  const [focus, setFocus] = useState<NodeId | null>(doc.rootId);
  const [selected, setSelected] = useState<Set<NodeId>>(() => new Set());
  const [selectAnchor, setSelectAnchor] = useState<NodeId | null>(null);

  useEffect(() => crud.subscribe(() => setDoc(crud.snapshot())), [crud]);

  const data = useMemo(
    () => toNormalized(doc, expanded, focus, selected, selectAnchor),
    [doc, expanded, focus, selected, selectAnchor],
  );

  const json = useMemo(() => JSON.stringify(crud.toJson(), null, 2), [crud, doc]);

  const onEvent = useCallback(
    (event: UiEvent) => {
      if (
        handleJsonDocViewEvent(event, {
          doc,
          expanded,
          focus,
          selectAnchor,
          setExpanded,
          setFocus,
          setSelected,
          setSelectAnchor,
        })
      ) {
        return;
      }

      handleJsonDocCrudEvent(event, { crud, setExpanded, setSelected });
    },
    [crud, doc, expanded, focus, selectAnchor],
  );

  return { data, json, onEvent };
}
