// SSOT: 라이브러리 패키지 소스 그대로. 문서가 코드보다 뒤처질 수 없다.
import jsonCrudSrc from "../../../../packages/zod-crud/src/json-crud.ts?raw";
import jsonCrudInstanceSrc from "../../../../packages/zod-crud/src/internal/json-crud-instance.ts?raw";
import jsonMutationsSrc from "../../../../packages/zod-crud/src/mutate/mutations.ts?raw";
import jsonClipboardSrc from "../../../../packages/zod-crud/src/clipboard/clipboard.ts?raw";
import jsonHistorySrc from "../../../../packages/zod-crud/src/history/json-history.ts?raw";
import jsonDeleteManySrc from "../../../../packages/zod-crud/src/mutate/delete-many.ts?raw";
import jsonPasteSrc from "../../../../packages/zod-crud/src/clipboard/paste/dispatch.ts?raw";
import jsonMoveSrc from "../../../../packages/zod-crud/src/mutate/move.ts?raw";
import jsonSelectionSrc from "../../../../packages/zod-crud/src/selection/select.ts?raw";
import jsonDocSerializationSrc from "../../../../packages/zod-crud/src/document/json-doc-serialization.ts?raw";
import jsonDocAccessSrc from "../../../../packages/zod-crud/src/document/json-doc-access.ts?raw";

export type SourceKey =
  | "json-crud"
  | "json-crud-instance"
  | "json-mutations"
  | "json-clipboard"
  | "json-history"
  | "json-delete-many"
  | "json-paste"
  | "json-move"
  | "json-selection"
  | "json-doc-serialization"
  | "json-doc-access";

export const sourceMap: Record<SourceKey, { filename: string; source: string }> = {
  "json-crud": { filename: "json-crud.ts", source: jsonCrudSrc },
  "json-crud-instance": { filename: "internal/json-crud-instance.ts", source: jsonCrudInstanceSrc },
  "json-mutations": { filename: "mutate/mutations.ts", source: jsonMutationsSrc },
  "json-clipboard": { filename: "clipboard/clipboard.ts", source: jsonClipboardSrc },
  "json-history": { filename: "history/json-history.ts", source: jsonHistorySrc },
  "json-delete-many": { filename: "mutate/delete-many.ts", source: jsonDeleteManySrc },
  "json-paste": { filename: "clipboard/paste/dispatch.ts", source: jsonPasteSrc },
  "json-move": { filename: "mutate/move.ts", source: jsonMoveSrc },
  "json-selection": { filename: "selection/select.ts", source: jsonSelectionSrc },
  "json-doc-serialization": { filename: "document/json-doc-serialization.ts", source: jsonDocSerializationSrc },
  "json-doc-access": { filename: "document/json-doc-access.ts", source: jsonDocAccessSrc },
};
