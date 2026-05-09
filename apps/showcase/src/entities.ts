import { adminWorkspaceEntity } from "./admin-workspace-entity.js";
import {
  makeEditor,
  makeEditorFromValue,
} from "./entity-editors.js";
import type { EntityDefinition } from "./entity-definition.js";
import { menuTreeEntity } from "./menu-tree-entity.js";

export type { EntityDefinition } from "./entity-definition.js";
export {
  makeEditor,
  makeEditorFromValue,
} from "./entity-editors.js";

export const entityDefinitions = [
  adminWorkspaceEntity,
  menuTreeEntity,
] satisfies EntityDefinition[];

export const defaultEntityId = entityDefinitions[0]?.id ?? "";

export function entityById(entityId: string): EntityDefinition {
  return entityDefinitions.find((entity) => entity.id === entityId) ?? entityDefinitions[0]!;
}
