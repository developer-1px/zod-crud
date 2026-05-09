import {
  createJsonCrud,
  type JsonCrud,
  type JsonValue,
} from "zod-crud";

import type { EntityDefinition } from "./entity-definition.js";

export function makeEditor(entity: EntityDefinition): JsonCrud<JsonValue> {
  let nextItemIndex = 1;

  return createJsonCrud(entity.schema, entity.initialValue, {
    childKeys: entity.childKeys,
    defaultFor: (parentPath) => entity.defaultValue(parentPath, nextItemIndex++),
  });
}

export function makeEditorFromValue(entity: EntityDefinition, value: JsonValue): JsonCrud<JsonValue> {
  let nextItemIndex = 1;

  return createJsonCrud(entity.schema, value, {
    childKeys: entity.childKeys,
    defaultFor: (parentPath) => entity.defaultValue(parentPath, nextItemIndex++),
  });
}
