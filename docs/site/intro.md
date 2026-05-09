# zod-crud 소개

`zod-crud`는 Zod 스키마로 보호되는 headless JSON editor interaction core입니다. UI 컴포넌트나 폼 라이브러리가 아니라, 복잡한 JSON 값을 안정적인 노드 테이블로 바꾼 뒤 focus recovery, selection-safe command, edit, clipboard, move, history를 하나의 `NodeId` 기반 모델로 다루는 코어 라이브러리입니다.

이 프로젝트의 핵심 전제는 간단합니다. editor에서 어려운 것은 단일 field update가 아닙니다. focus, selection, edit command, clipboard, move, undo/redo가 모두 같은 document topology 위에서 움직여야 한다는 점이 어렵습니다. `zod-crud`는 그 공통 언어를 `NodeId`로 잡습니다. 루트, 객체 필드, 배열 원소, 문자열, 숫자, boolean, null 모두 노드가 됩니다.

## 왜 이 라이브러리가 필요한가

중첩 JSON editor를 각 기능별로 따로 구현하면 네 가지 문제가 자주 생깁니다.

- 깊은 경로를 계속 들고 다녀야 해서 UI 선택 상태와 실제 데이터가 쉽게 어긋납니다.
- 배열 삽입과 삭제 뒤에는 인덱스가 바뀌므로 이전 경로가 더 이상 같은 대상을 가리키지 않을 수 있습니다.
- 스키마 검증이 저장 직전에만 있으면 UI 내부 상태에는 이미 불가능한 값이 퍼질 수 있습니다.
- clipboard, move, history가 서로 다른 기준으로 상태를 기록하면 undo나 paste 뒤 focus/select recovery가 흔들립니다.

`zod-crud`는 값을 flat document로 직렬화하고, 모든 명령을 노드 id 기준으로 실행합니다. 명령은 후보 문서를 만든 뒤 다시 루트 스키마를 통과해야만 commit됩니다. 실패하면 document, history, clipboard, id allocator 상태가 유지됩니다.

## 프로젝트가 약속하는 것

- 루트 스키마를 통과하지 못하는 초기 값은 editor가 만들어지지 않습니다.
- 성공한 mutation만 document를 바꾸고 subscriber를 호출합니다.
- 실패한 mutation은 `OperationResult`로 실패 이유를 돌려주며, 중간 상태를 노출하지 않습니다.
- `snapshot()`은 현재 flat document의 복사본을 돌려줍니다.
- `toJson()`과 `read()`는 다시 JSON 값으로 역직렬화한 결과를 돌려줍니다.
- clipboard와 history는 별도 애드온이 아니라 같은 commit 규칙 위에서 동작합니다.
- `moveBefore`, `moveAfter`, `moveInto`는 clipboard를 건드리지 않는 reorder/move command입니다.
- 모든 주요 mutation에는 `can*` preflight가 있어 실행 전 실패 여부를 확인할 수 있습니다.
- 실패 결과에는 사람이 읽는 `reason`과 기계가 읽는 `code`가 함께 들어갈 수 있습니다.

## 공개 API는 실제 엔트리 파일이 정본입니다

아래 블록은 문서용 복사본이 아니라 실제 패키지 엔트리 파일에서 가져옵니다. 문서가 API 이름을 다시 쓰지 않기 때문에 export가 바뀌면 이 블록도 같은 파일에서 즉시 바뀝니다.

::source{path="packages/zod-crud/src/index.ts" lines="1-26"}

## 언제 쓰면 좋은가

`zod-crud`는 JSON 기반 편집기를 만들 때 특히 잘 맞습니다. 예를 들면 설정 편집기, schema-aware admin UI, nested menu builder, rule editor, JSON document inspector, treegrid 기반 데이터 편집기처럼 구조는 JSON이고 편집 단위는 노드인 경우입니다.

반대로 단순 폼 하나만 제출하면 되는 화면에는 과할 수 있습니다. 그 경우에는 폼 라이브러리와 Zod 검증만으로 충분합니다. `zod-crud`가 빛나는 지점은 "값 전체"가 아니라 "문서 구조"를 편집해야 할 때입니다.

## 이 사이트의 코드 원칙

공식 문서의 TypeScript 예제는 복붙하지 않습니다. 예제는 `apps/site/src/examples`의 실제 실행 파일에서 가져오고, 라이브러리 설명은 `packages/zod-crud/src`의 실제 소스 범위를 가져옵니다. 문서 작성자는 `::source{path="..." lines="..."}`만 지정합니다.
