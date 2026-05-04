import type { EntityDefinition } from "./entities.js";

export function EntityRegistry({
  entities,
  activeEntityId,
  onSelect,
}: {
  entities: EntityDefinition[];
  activeEntityId: string;
  onSelect: (entityId: string) => void;
}) {
  return (
    <div className="entity-list">
      {entities.map((entity) => (
        <button
          key={entity.id}
          type="button"
          className={activeEntityId === entity.id ? "entity-card is-active" : "entity-card"}
          onClick={() => onSelect(entity.id)}
        >
          <span>{entity.label}</span>
          <small>{entity.schemaName}</small>
        </button>
      ))}
    </div>
  );
}
