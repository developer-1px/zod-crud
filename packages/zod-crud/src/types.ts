// Barrel re-export. Source-of-truth types now live in their domain folders:
//   - document/json-doc-types.ts  (JsonValue, JsonDoc, JsonNode, JsonPath, JsonChange, FocusFilter, ...)
//   - result/operation-types.ts   (OperationResult, OperationFailureCode)
//   - clipboard/paste/paste-types.ts (PasteMode, PasteOptions)
//   - internal/crud-options.ts    (JsonCrudOptions)
export type {
  DefaultValueFactory,
  FocusFilter,
  JsonArray,
  JsonChange,
  JsonDoc,
  JsonKey,
  JsonNode,
  JsonNodeType,
  JsonObject,
  JsonPath,
  JsonPrimitive,
  JsonValue,
  NodeId,
} from "./document/json-doc-types.js";
export type { OperationFailureCode, OperationResult } from "./result/operation-types.js";
export type { PasteMode, PasteOptions } from "./clipboard/paste/paste-types.js";
export type { JsonCrudOptions } from "./internal/crud-options.js";
