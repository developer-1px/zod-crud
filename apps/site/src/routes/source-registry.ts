// SSOT: 라이브러리 패키지 소스 그대로. 문서가 코드보다 뒤처질 수 없다.
import jsonCrudSrc from "../../../../packages/zod-crud/src/editor/json-crud.ts?raw";
import jsonMutationsSrc from "../../../../packages/zod-crud/src/editor/json-mutations.ts?raw";
import jsonClipboardSrc from "../../../../packages/zod-crud/src/editor/json-clipboard.ts?raw";
import jsonHistorySrc from "../../../../packages/zod-crud/src/editor/json-history.ts?raw";
import jsonDeleteManySrc from "../../../../packages/zod-crud/src/editor/json-delete-many.ts?raw";
import jsonPasteSrc from "../../../../packages/zod-crud/src/editor/json-paste.ts?raw";
import jsonMoveSrc from "../../../../packages/zod-crud/src/editor/json-move.ts?raw";
import jsonSelectionSrc from "../../../../packages/zod-crud/src/editor/json-selection.ts?raw";
import jsonDocSrc from "../../../../packages/zod-crud/src/document/json-doc.ts?raw";

export type SourceKey =
  | "json-crud"
  | "json-mutations"
  | "json-clipboard"
  | "json-history"
  | "json-delete-many"
  | "json-paste"
  | "json-move"
  | "json-selection"
  | "json-doc";

export const sourceMap: Record<SourceKey, { filename: string; source: string }> = {
  "json-crud": { filename: "editor/json-crud.ts", source: jsonCrudSrc },
  "json-mutations": { filename: "editor/json-mutations.ts", source: jsonMutationsSrc },
  "json-clipboard": { filename: "editor/json-clipboard.ts", source: jsonClipboardSrc },
  "json-history": { filename: "editor/json-history.ts", source: jsonHistorySrc },
  "json-delete-many": { filename: "editor/json-delete-many.ts", source: jsonDeleteManySrc },
  "json-paste": { filename: "editor/json-paste.ts", source: jsonPasteSrc },
  "json-move": { filename: "editor/json-move.ts", source: jsonMoveSrc },
  "json-selection": { filename: "editor/json-selection.ts", source: jsonSelectionSrc },
  "json-doc": { filename: "document/json-doc.ts", source: jsonDocSrc },
};
