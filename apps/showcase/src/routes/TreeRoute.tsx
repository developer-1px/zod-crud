import { useTreePattern } from "@p/aria-kernel/patterns";
import { RouteLayout, TreeNode } from "./RouteLayout.js";
import { useJsonDocRouteAdapter } from "./useJsonDocRouteAdapter.js";

export function TreeRoute() {
  const { data, json, onEvent } = useJsonDocRouteAdapter();

  const { rootProps, itemProps, items } = useTreePattern(data, onEvent, {
    label: "Headless Tree + zod-crud",
    multiSelectable: true,
  });

  return (
    <RouteLayout
      title="useTreePattern"
      hint="←/→로 expand·collapse + 부모/자식 이동, ↑↓로 visible siblings 이동."
      tree={
        <ul {...rootProps} className="tree">
          {items.map((it) => (
            <li key={it.id} {...itemProps(it.id)} className="tree__row">
              <TreeNode
                label={it.label}
                level={it.level}
                hasChildren={it.hasChildren}
                expanded={it.expanded}
              />
            </li>
          ))}
        </ul>
      }
      json={json}
    />
  );
}
