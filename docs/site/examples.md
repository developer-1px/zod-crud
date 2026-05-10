# 예제 읽기

## BasicCrud — `replace` 만으로 충분

::source{path="apps/site/src/examples/BasicCrud.tsx" title="BasicCrud.tsx" lines="1-35"}

훅 1개, op 1개 (`replace`). state 는 `z.output<Schema>` 그대로라 사용자는 `json.title`, `json.done` 처럼 일반 객체로 읽습니다.

## ClipboardArray — copy / cut / duplicate

::source{path="apps/site/src/examples/ClipboardArray.tsx" title="ClipboardArray.tsx" lines="1-75"}

`copy` 와 `patch([copy, remove])` 만으로 클립보드 의미를 표현합니다. 별도 clipboard mode 가 없습니다.

## RejectedDrift — 시끄러운 schema 검증

::source{path="apps/site/src/examples/RejectedDrift.tsx" title="RejectedDrift.tsx" lines="1-50"}

`z.number().max(100)` 위반 시 `JsonResult.code = "schema_violation"`. `strict: false` 라 throw 하지 않고 `onError` 와 반환값으로 통보합니다.

## 첫 patch — React 없이

::source{path="apps/site/src/examples/snippet-getting-started.ts" title="snippet" lines="1-28"}

`applyPatch` 는 어떤 환경에서도 import 가능한 순수함수입니다.
