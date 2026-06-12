import type { z } from "zod";

import type { CapabilityResult } from "../can/result.js";
import type { Pointer } from "../../../foundation/pointer/index.js";
import {
  type SchemaDescriptionResult,
  type SchemaKindResult,
  type SchemaQueryResult,
  describeDocumentSchema,
  queryDocumentSchema,
  readDocumentSchemaKind,
} from "./query.js";
import { canDocumentSchemaAccepts } from "./accepts.js";
import type { SchemaPathMode } from "./resolve.js";

export interface SchemaState {
  at(path: Pointer, mode?: SchemaPathMode): SchemaQueryResult;
  kind(path: Pointer, mode?: SchemaPathMode): SchemaKindResult;
  accepts(path: Pointer, value: unknown, mode?: SchemaPathMode): CapabilityResult;
  describe(path: Pointer, mode?: SchemaPathMode): SchemaDescriptionResult;
}

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
