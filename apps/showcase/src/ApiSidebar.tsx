import {
  apiGroups,
  type ApiId,
} from "./api-catalog.js";

export function ApiSidebar({
  activeApi,
  onSelect,
}: {
  activeApi: ApiId;
  onSelect: (api: ApiId) => void;
}) {
  return (
    <nav className="api-sidebar" aria-label="Callable zod-crud APIs">
      {apiGroups.map((group) => (
        <section key={group.title} className="api-group">
          <h2>{group.title}</h2>
          <div className="api-list">
            {group.apis.map((api) => (
              <button
                key={api.id}
                type="button"
                className={activeApi === api.id ? "api-item is-active" : "api-item"}
                onClick={() => onSelect(api.id)}
              >
                <span>{api.label}</span>
                <small>{api.call}</small>
              </button>
            ))}
          </div>
        </section>
      ))}
    </nav>
  );
}
