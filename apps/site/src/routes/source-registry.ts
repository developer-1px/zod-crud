// SSOT: 라이브러리 패키지 소스 그대로. 문서가 코드보다 뒤처질 수 없다.
import jsonCrudSrc from "../../../../packages/zod-crud/src/editor/json-crud.ts?raw";
import jsonPasteSrc from "../../../../packages/zod-crud/src/editor/json-paste.ts?raw";
import jsonDocSrc from "../../../../packages/zod-crud/src/document/json-doc.ts?raw";

export type SourceKey = "json-crud" | "json-paste" | "json-doc";

export const sourceMap: Record<SourceKey, { filename: string; source: string }> = {
  "json-crud": { filename: "editor/json-crud.ts", source: jsonCrudSrc },
  "json-paste": { filename: "editor/json-paste.ts", source: jsonPasteSrc },
  "json-doc": { filename: "document/json-doc.ts", source: jsonDocSrc },
};
