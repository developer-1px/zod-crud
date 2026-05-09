import {
  createJsonCrud,
  type JsonCrud,
  type JsonValue,
} from "zod-crud";

import { labEntity } from "./lab-entity.js";

export function makeEditor(): JsonCrud<JsonValue> {
  return createJsonCrud(labEntity.schema, labEntity.initialValue, {
    childKeys: labEntity.childKeys,
  });
}
