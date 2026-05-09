# 시작하기

## 설치

패키지는 `zod-crud`와 peer dependency인 `zod`를 함께 사용합니다.

`npm install zod-crud zod`

## 첫 번째 interaction session 만들기

가장 작은 사용 흐름은 단순 field update가 아니라 interaction session입니다.

- Zod 루트 스키마를 정의합니다.
- 초기 값을 넘겨 `createJsonCrud`를 호출합니다.
- 필요한 노드를 `find`로 찾고 `update`, `copy`, `paste`, `moveInto`, `undo`, `redo` 같은 명령을 실행합니다.
- 성공 결과의 `focusNodeId`와 `focusNodeIds`를 보고 UI layer가 focus/select recovery를 적용할 수 있습니다.

아래 예제는 사이트에서 실제로 import되는 예제 파일입니다. 문서에 따로 코드를 적지 않고 원본 파일의 line range만 표시합니다.

::source{path="apps/site/src/examples/snippet-getting-started.ts" lines="1-34" title="first-editor.ts"}

## 생성 시점의 검증

`createJsonCrud(schema, initialValue)`는 초기 값을 그대로 저장하지 않습니다. 먼저 루트 스키마의 `safeParse`를 통과시키고, parse된 output을 flat `JsonDoc`으로 직렬화합니다. 그 다음 document를 다시 검증해서 parse 결과와 저장된 JSON이 정확히 일치하는지 확인합니다.

::source{path="packages/zod-crud/src/json-crud.ts" lines="81-100" title="createJsonCrud initialization"}

## UI에서 상태 구독하기

React 예제에서는 `snapshot()`을 state에 올리고, `subscribe()`로 성공 commit 이후에만 다시 snapshot을 읽습니다. 실패한 mutation은 subscriber를 호출하지 않으므로 UI가 임시 실패 상태를 document로 착각하지 않습니다.

::source{path="apps/site/src/examples/BasicCrud.tsx" lines="10-19" title="BasicCrud state bridge"}

## 실행 전 확인하기

모든 주요 mutation에는 대응하는 `can*` preflight가 있습니다. preflight는 document, history, clipboard, id allocator를 바꾸지 않고 같은 검증 경로를 통과해 성공 가능 여부를 돌려줍니다.

::source{path="packages/zod-crud/src/json-crud.ts" lines="198-235" title="preflight APIs"}

## 기본 편집 흐름

노드는 루트부터 찾습니다. 객체 필드는 문자열 key, 배열 원소는 number key를 갖습니다. `find(root, "title")`처럼 노드 id를 얻고 나면 UI는 경로나 깊이를 몰라도 됩니다.

::source{path="apps/site/src/examples/BasicCrud.tsx" lines="21-38" title="BasicCrud editing UI"}

## 결과 읽기

`snapshot()`은 flat document를 돌려주고, `toJson()`은 다시 JSON 값으로 돌려줍니다. 화면 렌더링에는 `snapshot()`이 유리하고, 저장이나 전송에는 `toJson()`이 보통 더 적합합니다.

::source{path="packages/zod-crud/src/json-crud.ts" lines="169-188" title="read APIs"}
