# 고급 옵션과 설계 선택

## 옵션은 적고 명시적입니다

`zod-crud`는 editor framework가 아니라 document engine입니다. 그래서 옵션도 UI 정책 전체를 받지 않습니다. 현재 옵션은 child array 탐색, focus 후보 필터링, create 기본값 생성에 집중되어 있습니다.

::source{path="packages/zod-crud/src/types.ts" lines="111-123" title="PasteOptions / JsonCrudOptions"}

## defaultFor

`create`나 `appendChild`에서 value를 생략하면 라이브러리는 새 노드에 넣을 값을 찾아야 합니다. 먼저 사용자가 넘긴 value가 있으면 그대로 사용합니다. 없으면 `defaultFor`가 있으면 그 값을 복사해서 사용합니다. 그래도 없으면 해당 child schema가 `undefined`를 parse해서 기본값을 만들 수 있는지 확인합니다.

이 흐름은 Zod default를 지원하지만, 최종 commit에서는 여전히 exact match 검증을 통과해야 합니다.

::source{path="packages/zod-crud/src/crud/json-create-helpers.ts" lines="9-34" title="resolveCreateValue"}

## childKeys

tree-like object는 종종 `{ children: [...] }` 형태를 갖습니다. `appendChild`가 object를 받았을 때 어느 배열 field에 child를 넣을지 결정해야 합니다. 라이브러리는 schema에서 object array field를 찾고, 현재 object에 이미 존재하는 array field를 보고, 마지막으로 `childKeys` 옵션을 함께 고려합니다.

::source{path="packages/zod-crud/src/crud/json-create-helpers.ts" lines="36-85" title="child array resolution"}

## focusFilter

mutation 성공 결과에는 UI가 다음에 focus할 수 있는 node id가 들어갈 수 있습니다. 하지만 모든 node가 UI에서 focus 가능한 것은 아닐 수 있습니다. `focusFilter`는 성공 결과가 focus 후보를 고를 때 document와 candidate id를 보고 제외할 수 있게 해줍니다.

::source{path="packages/zod-crud/src/operation-result.ts" lines="10-26" title="successResult focus"}

## structured failure

실패 결과는 `reason`만 갖지 않습니다. core consumer가 실패 정책을 세울 수 있도록 `code`, `nodeId`, `path`를 선택적으로 포함합니다. 예를 들어 schema mismatch는 `schema_mismatch`, 비어 있는 clipboard는 `clipboard_empty`, root를 삭제하거나 이동하려는 경우는 `root_operation`으로 분류됩니다.

::source{path="packages/zod-crud/src/types.ts" lines="38-106" title="failure codes"}

::source{path="packages/zod-crud/src/failure.ts" lines="1-28" title="failure helper"}

## schema path lookup

부분 검증은 현재 node path에서 schema child를 따라가며 target schema를 찾습니다. schema를 찾지 못하면 해당 path의 값을 안전하게 검증할 수 없으므로 실패합니다.

::source{path="packages/zod-crud/src/schema/schema-path.ts" lines="9-21" title="schemaAtPath"}

## 설계상 하지 않는 일

`zod-crud`는 UI를 렌더링하지 않습니다. 키보드 이동, aria 속성, field layout, form submission, server sync는 소비자 앱의 책임입니다. 이 라이브러리는 그 아래에서 document mutation의 원자성, 스키마 안전성, clipboard/history 일관성을 담당합니다.

또한 라이브러리는 도메인 객체를 보존하지 않습니다. JSON primitive, object, array만 저장합니다. 이 제한 덕분에 snapshot, diff, clipboard payload, undo history를 JSON document semantics 안에서 설명할 수 있습니다.
