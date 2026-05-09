// SSOT: 라이브러리 패키지 소스 그대로. 문서가 코드보다 뒤처질 수 없다.
import jsonCrudSrc from "../../../../packages/zod-crud/src/json-crud.ts?raw";
import jsonCrudInstanceSrc from "../../../../packages/zod-crud/src/internal/json-crud-instance.ts?raw";
import jsonMutationsSrc from "../../../../packages/zod-crud/src/mutate/mutations.ts?raw";
import jsonClipboardSrc from "../../../../packages/zod-crud/src/clipboard/clipboard.ts?raw";
import jsonHistorySrc from "../../../../packages/zod-crud/src/history/json-history.ts?raw";
import jsonDeleteManySrc from "../../../../packages/zod-crud/src/bulk/delete-many.ts?raw";
import jsonPasteSrc from "../../../../packages/zod-crud/src/clipboard/paste/paste.ts?raw";
import jsonMoveSrc from "../../../../packages/zod-crud/src/bulk/move.ts?raw";
import jsonSelectionSrc from "../../../../packages/zod-crud/src/bulk/select.ts?raw";
import jsonDocSrc from "../../../../packages/zod-crud/src/document/json-doc.ts?raw";

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
  | "json-doc";

export const sourceMap: Record<SourceKey, { filename: string; source: string }> = {
  "json-crud": { filename: "json-crud.ts", source: jsonCrudSrc },
  "json-crud-instance": { filename: "internal/json-crud-instance.ts", source: jsonCrudInstanceSrc },
  "json-mutations": { filename: "mutate/mutations.ts", source: jsonMutationsSrc },
  "json-clipboard": { filename: "clipboard/clipboard.ts", source: jsonClipboardSrc },
  "json-history": { filename: "history/json-history.ts", source: jsonHistorySrc },
  "json-delete-many": { filename: "bulk/delete-many.ts", source: jsonDeleteManySrc },
  "json-paste": { filename: "clipboard/paste/paste.ts", source: jsonPasteSrc },
  "json-move": { filename: "bulk/move.ts", source: jsonMoveSrc },
  "json-selection": { filename: "bulk/select.ts", source: jsonSelectionSrc },
  "json-doc": { filename: "document/json-doc.ts", source: jsonDocSrc },
};
