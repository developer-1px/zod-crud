import type * as z from "zod";
import { parsePointer, type Pointer } from "../../../foundation/pointer/index.js";
import { numericSegment } from "../../../foundation/patch/path.js";
import { schemaAtPointer } from "../introspection.js";
import { isJsonPrimitive, isPlainStringKeySchema } from "./knownJson.js";
import { getArrayElement, getDef, getObjectShape } from "../zod.js";

interface LocalSchemaCache {
  pointerSchemas: Map<string, z.ZodType | null>;
}

const plainStructuralSchemaCache = new WeakMap<object, boolean>();
const knownJsonOutputSchemaCache = new WeakMap<object, boolean>();
const localSchemaCaches = new WeakMap<object, LocalSchemaCache>();

export function arrayElementSchemaAtParent(schema: z.ZodType, parent: Pointer): z.ZodType | null {
  const parentSchema = cachedSchemaAtPointer(schema, parent, "value");
  return parentSchema ? getArrayElement(parentSchema) : null;
}

export function cachedSchemaAtPointer(
  schema: z.ZodType,
  pointer: Pointer,
  mode: "value" | "insert" = "value",
): z.ZodType | null {
  let cache = localSchemaCaches.get(schema as object);
  if (!cache) {
    cache = { pointerSchemas: new Map() };
    localSchemaCaches.set(schema as object, cache);
  }
  const key = `${mode}\0${pointer}`;
  const cached = cache.pointerSchemas.get(key);
  if (cached !== undefined) return cached;
  const result = schemaAtPointer(schema, pointer, mode);
  cache.pointerSchemas.set(key, result);
  return result;
}

export function isPlainStructuralSchema(schema: z.ZodType, seen?: WeakSet<object>): boolean {
  const cached = plainStructuralSchemaCache.get(schema as object);
  if (cached !== undefined) return cached;
  const activeSeen = seen ?? new WeakSet<object>();
  if (activeSeen.has(schema as object)) return true;
  activeSeen.add(schema as object);

  const def = getDef(schema);
  if (Array.isArray(def.checks) && def.checks.length > 0) return cachePlainStructuralSchema(schema, false);

  switch (def.type) {
    case "object": {
      const shape = getObjectShape(schema);
      if (!shape) return cachePlainStructuralSchema(schema, false);
      if (!Object.values(shape).every((child) => isPlainStructuralSchema(child, activeSeen))) {
        return cachePlainStructuralSchema(schema, false);
      }
      return cachePlainStructuralSchema(schema, def.catchall ? isPlainStructuralSchema(def.catchall, activeSeen) : true);
    }
    case "array": {
      const element = getArrayElement(schema);
      return cachePlainStructuralSchema(schema, element ? isPlainStructuralSchema(element, activeSeen) : false);
    }
    case "record":
      return cachePlainStructuralSchema(
        schema,
        (!def.keyType || isPlainStructuralSchema(def.keyType, activeSeen))
          && !!def.valueType
          && isPlainStructuralSchema(def.valueType, activeSeen),
      );
    case "optional":
    case "nullable":
      return cachePlainStructuralSchema(schema, !!def.innerType && isPlainStructuralSchema(def.innerType, activeSeen));
    case "string":
    case "number":
    case "boolean":
    case "null":
    case "literal":
    case "enum":
    case "unknown":
    case "any":
    case "never":
      return cachePlainStructuralSchema(schema, true);
    default:
      return cachePlainStructuralSchema(schema, false);
  }
}

function cachePlainStructuralSchema(schema: z.ZodType, value: boolean): boolean {
  plainStructuralSchemaCache.set(schema as object, value);
  return value;
}

export function schemaOutputIsKnownJson(schema: z.ZodType, seen?: WeakSet<object>): boolean {
  const cached = knownJsonOutputSchemaCache.get(schema as object);
  if (cached !== undefined) return cached;
  const shouldCache = seen === undefined;
  const finish = (value: boolean): boolean => {
    if (shouldCache) knownJsonOutputSchemaCache.set(schema as object, value);
    return value;
  };
  const activeSeen = seen ?? new WeakSet<object>();
  if (activeSeen.has(schema as object)) return true;
  activeSeen.add(schema as object);

  const def = getDef(schema);
  if (def.coerce) return finish(false);

  switch (def.type) {
    case "object": {
      const shape = getObjectShape(schema);
      if (!shape) return finish(false);
      for (const key of Object.keys(shape)) {
        if (key === "__proto__") return finish(false);
        const child = shape[key];
        if (!child || !schemaOutputIsKnownJson(child, activeSeen)) return finish(false);
      }
      if (def.catchall && !schemaOutputIsKnownJson(def.catchall, activeSeen)) return finish(false);
      return finish(true);
    }
    case "array": {
      const element = getArrayElement(schema);
      return finish(element ? schemaOutputIsKnownJson(element, activeSeen) : false);
    }
    case "nullable":
      return finish(!!def.innerType && schemaOutputIsKnownJson(def.innerType, activeSeen));
    case "nonoptional": {
      if (!def.innerType) return finish(false);
      const innerDef = getDef(def.innerType);
      const outputSchema = innerDef.type === "optional" ? innerDef.innerType : def.innerType;
      return finish(!!outputSchema && schemaOutputIsKnownJson(outputSchema, activeSeen));
    }
    case "prefault":
      return finish(!!def.innerType && schemaOutputIsKnownJson(def.innerType, activeSeen));
    case "pipe":
      return finish(!!def.out && schemaOutputIsKnownJson(def.out, activeSeen));
    case "intersection":
      return finish(!!def.left && !!def.right && schemaOutputIsKnownJson(def.left, activeSeen) && schemaOutputIsKnownJson(def.right, activeSeen));
    case "string":
    case "number":
    case "boolean":
    case "null":
      return finish(true);
    case "literal":
      return finish(Array.isArray(def.values) && def.values.every(isJsonPrimitive));
    case "enum": {
      const values = Array.isArray(def.values) ? def.values : def.entries && typeof def.entries === "object" ? Object.values(def.entries) : null;
      return finish(values !== null && values.every(isJsonPrimitive));
    }
    case "record":
      return finish((!def.keyType || isPlainStringKeySchema(def.keyType)) && !!def.valueType && schemaOutputIsKnownJson(def.valueType, activeSeen));
    case "union":
      return finish(Array.isArray(def.options) && def.options.length > 0 && def.options.every((option) => schemaOutputIsKnownJson(option, activeSeen)));
    case "tuple":
      return finish(Array.isArray(def.items) && def.items.every((item) => schemaOutputIsKnownJson(item, activeSeen)) && (!def.rest || schemaOutputIsKnownJson(def.rest, activeSeen)));
    case "readonly":
      return finish(!!def.innerType && schemaOutputIsKnownJson(def.innerType, activeSeen));
    case "lazy": {
      if (!def.getter) return finish(false);
      try {
        return finish(schemaOutputIsKnownJson(def.getter(), activeSeen));
      } catch {
        return finish(false);
      }
    }
    default:
      return finish(false);
  }
}

export function prefixIssues(path: Pointer, issues: z.ZodError["issues"]): z.ZodError["issues"] {
  const prefix = parsePointer(path).map((segment) => numericSegment(segment) ?? segment);
  return issues.map((issue) => ({ ...issue, path: [...prefix, ...issue.path] }));
}
