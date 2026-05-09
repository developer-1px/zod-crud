import { useTreeGridPattern } from "@p/aria-kernel/patterns";
import { RouteLayout, TreeNode } from "./RouteLayout.js";
import { useJsonDocRouteAdapter } from "./useJsonDocRouteAdapter.js";

export function HeadlessRoute() {
  const { data, json, onEvent } = useJsonDocRouteAdapter();

  const { treegridProps, rowProps, items } = useTreeGridPattern(
    data,
    onEvent,
    {
      label: "Headless TreeGrid + zod-crud",
      multiSelectable: true,
      navigationMode: "row",
      colCount: 1,
    },
  );

  return (
    <RouteLayout
      title="useTreeGridPattern"
      hint="화살표 / Home·End / Space·Right로 expand / Shift+화살표 range select. onEvent → zod-crud."
      tree={
        <div {...treegridProps} className="tree">
          {items.map((it) => (
            <div key={it.id} {...rowProps(it.id)} className="tree__row">
              <TreeNode
                label={it.label}
                level={it.level}
                hasChildren={it.hasChildren}
                expanded={it.expanded}
              />
            </div>
          ))}
        </div>
      }
      json={json}
    />
  );
}
