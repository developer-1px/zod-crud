# 예제 읽기

이 페이지는 공식 사이트의 실행 예제를 문서 흐름으로 다시 설명합니다. 중요한 원칙은 예제 코드도 문서 안에 쓰지 않는다는 것입니다. 모든 예제 블록은 `apps/site/src/examples`의 실제 파일에서 가져옵니다.

## Basic CRUD

가장 작은 React 연결 예제입니다. schema, `createJsonCrud`, `snapshot`, `subscribe`, `find`, `update`, `toJson`의 기본 흐름을 보여줍니다. 화면은 title input과 done checkbox만 갖지만, 내부적으로는 root object 아래의 두 field node를 찾아 각각 업데이트합니다.

::source{path="apps/site/src/examples/BasicCrud.tsx" lines="1-38" title="BasicCrud.tsx"}

## Clipboard + history

배열 field를 편집할 때 node id가 왜 필요한지 보여주는 예제입니다. 선택 상태는 배열 index가 아니라 `NodeId`로 저장합니다. 복사와 잘라내기는 선택 node를 기준으로 하고, paste는 tags 배열 node를 target으로 실행합니다.

::source{path="apps/site/src/examples/ClipboardArray.tsx" lines="1-53" title="ClipboardArray.tsx"}

## Schema-rejected drift

스키마가 거절하는 값을 넣었을 때 document가 바뀌지 않는다는 것을 보여줍니다. 이 예제는 실패 reason을 UI 상태로 보여주지만, document 자체는 성공 commit 이전에는 바뀌지 않습니다.

::source{path="apps/site/src/examples/RejectedDrift.tsx" lines="1-55" title="RejectedDrift.tsx"}

## 사이트의 예제 화면도 같은 정본을 씁니다

`/examples` 화면은 왼쪽에서 고른 예제의 live demo와 오른쪽 source viewer를 동시에 보여줍니다. 그 source viewer 역시 같은 예제 파일을 raw import해서 보여줍니다.

::source{path="apps/site/src/routes/Examples.tsx" lines="1-24" title="Examples source registry"}
