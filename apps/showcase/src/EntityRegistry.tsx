import type { EntityDefinition } from "./entities.js";

export function EntityRegistry({
  entities,
  activeEntityId,
  stats,
  onSelect,
}: {
  entities: EntityDefinition[];
  activeEntityId: string;
  stats: Array<{ id: string; nodes: number }>;
  onSelect: (entityId: string) => void;
}) {
  return (
    <div className="entity-list">
      {entities.map((entity) => {
        const nodeCount = stats.find((stat) => stat.id === entity.id)?.nodes ?? 0;

        return (
          <button
            key={entity.id}
            type="button"
            className={activeEntityId === entity.id ? "entity-card is-active" : "entity-card"}
            onClick={() => onSelect(entity.id)}
          >
            <span>{entity.label}</span>
            <small>{entity.schemaName}</small>
            <em>{nodeCount} nodes</em>
          </button>
        );
      })}
    </div>
  );
}
