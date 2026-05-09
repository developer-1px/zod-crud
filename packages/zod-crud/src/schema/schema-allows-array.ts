import {
  type AnySchema,
  schemaDef,
  schemaType,
  unionOptions,
  unwrapTransparent,
} from "./schema-introspection.js";

export function schemaAllowsArray(schema: AnySchema): boolean {
  const current = unwrapTransparent(schema);
  const type = schemaType(current);

  if (type === "array") {
    return true;
  }

  if (type === "union") {
    return unionOptions(current).some(schemaAllowsArray);
  }

  if (type === "intersection") {
    const def = schemaDef(current);
    const left = def.left as AnySchema | undefined;
    const right = def.right as AnySchema | undefined;

    return left !== undefined && right !== undefined && schemaAllowsArray(left) && schemaAllowsArray(right);
  }

  if (type === "pipe") {
    const def = schemaDef(current);
    const output = def.out as AnySchema | undefined;
    const input = def.in as AnySchema | undefined;

    return (output !== undefined && schemaAllowsArray(output)) || (input !== undefined && schemaAllowsArray(input));
  }

  return false;
}
