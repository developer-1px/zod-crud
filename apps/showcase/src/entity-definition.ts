import * as z from "zod";

import type {
  JsonPath,
  JsonValue,
} from "zod-crud";

export type EntityDefinition = {
  id: string;
  label: string;
  schemaName: string;
  schema: z.ZodType<JsonValue, unknown>;
  initialValue: JsonValue;
  childKeys: string[];
  defaultValue: (parentPath: JsonPath, index: number) => JsonValue;
};

export function defineEntity<T extends JsonValue>(definition: {
  id: string;
  label: string;
  schemaName: string;
  schema: z.ZodType<T, unknown>;
  initialValue: T;
  childKeys: string[];
  defaultValue: (parentPath: JsonPath, index: number) => JsonValue;
}): EntityDefinition {
  return definition as unknown as EntityDefinition;
}
