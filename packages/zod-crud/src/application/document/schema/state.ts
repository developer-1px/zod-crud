import type { z } from "zod";

import {
  describeDocumentSchema,
  queryDocumentSchema,
  readDocumentSchemaKind,
} from "./query.js";
import { canDocumentSchemaAccepts } from "./accepts.js";
import type { SchemaState } from "./types.js";

export function createSchemaState<S extends z.ZodType>(
  schema: S,
): SchemaState {
  return {
    at: (path, mode = "value") => queryDocumentSchema(schema, path, mode),
    kind: (path, mode = "value") => readDocumentSchemaKind(schema, path, mode),
    accepts: (path, value, mode = "value") => canDocumentSchemaAccepts(schema, path, value, mode),
    describe: (path, mode = "value") => describeDocumentSchema(schema, path, mode),
  };
}
