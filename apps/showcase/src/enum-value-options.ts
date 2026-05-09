import type { JsonPath } from "zod-crud";

import {
  type AnySchema,
  schemaDef,
  schemaType,
  unionOptions,
  unwrapTransparent,
} from "./showcase-schema-introspection.js";
import {
  enumOptionKey,
  type EnumValueOption,
  isEnumValueOption,
} from "./schema-option-format.js";
import { schemaAtPath } from "./schema-option-path.js";

export function enumValueOptionsAtPath(schema: AnySchema, path: JsonPath): EnumValueOption[] {
  const target = schemaAtPath(schema, path);

  return target === null ? [] : enumValueOptions(target);
}

function enumValueOptions(schema: AnySchema): EnumValueOption[] {
  const current = unwrapTransparent(schema);
  const type = schemaType(current);

  if (type === "literal") {
    return literalValues(current);
  }

  if (type === "enum") {
    return enumValues(current);
  }

  if (type === "union") {
    const values: EnumValueOption[] = [];

    for (const option of unionOptions(current)) {
      const optionValues = enumValueOptions(option);

      if (optionValues.length === 0) {
        return [];
      }

      values.push(...optionValues);
    }

    return uniqueOptions(values);
  }

  return [];
}

function literalValues(schema: AnySchema): EnumValueOption[] {
  const values = (schema as { values?: Set<unknown> }).values ?? schemaDef(schema).values;

  return Array.isArray(values)
    ? values.filter(isEnumValueOption)
    : values instanceof Set
      ? [...values].filter(isEnumValueOption)
      : [];
}

function enumValues(schema: AnySchema): EnumValueOption[] {
  const options = (schema as { options?: unknown[] }).options;

  if (Array.isArray(options)) {
    return options.filter(isEnumValueOption);
  }

  const entries = schemaDef(schema).entries;

  return entries !== null && typeof entries === "object"
    ? Object.values(entries).filter(isEnumValueOption)
    : [];
}

function uniqueOptions(values: EnumValueOption[]): EnumValueOption[] {
  const seen = new Set<string>();
  const unique: EnumValueOption[] = [];

  for (const value of values) {
    const key = enumOptionKey(value);

    if (!seen.has(key)) {
      seen.add(key);
      unique.push(value);
    }
  }

  return unique;
}
