import type * as z from "zod";
import type { Pointer } from "../../../foundation/pointer/index.js";
import { arrayIndexPathLocation } from "../array/path.js";
import { arrayElementSchemaAtParent } from "../shared/schema.js";

export function arrayElementSchemaAtPath(schema: z.ZodType, path: Pointer): z.ZodType | null {
  const location = arrayIndexPathLocation(path);
  if (location === null) return null;
  return arrayElementSchemaAtParent(schema, location.parent);
}
