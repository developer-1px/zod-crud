# 작업 모델

## JsonCrud API

`JsonCrud`는 읽기, selection normalization, mutation, move/reorder, clipboard, history, subscription을 하나의 객체로 묶습니다. 중요한 점은 이 API들이 같은 document와 같은 commit 규칙을 공유한다는 것입니다. `update`만 안전하고 `paste`나 `move`는 별도 규칙으로 움직이는 구조가 아닙니다.

::source{path="packages/zod-crud/src/json-crud.ts" lines="37-79" title="JsonCrud API"}

## 읽기 API

`snapshot()`은 flat document 복사본을 돌려줍니다. `toJson()`은 document 전체를 JSON으로 복원하고 루트 스키마 parse를 다시 통과시킵니다. `read(nodeId)`는 특정 subtree만 JSON으로 읽습니다. `pathOf(nodeId)`와 `find(parentId, key)`는 UI가 node id와 경로 사이를 오갈 때 쓰는 작은 도구입니다.

::source{path="packages/zod-crud/src/json-crud.ts" lines="169-188" title="read helpers"}

## selection normalization

UI가 여러 node를 선택하더라도 core operation은 안전한 target set을 받아야 합니다. `normalizeSelection`은 duplicate를 제거하고, parent와 descendant가 동시에 들어오면 descendant를 제거하며, document order로 정렬합니다. 이것은 UI selection state가 아니라 batch operation planning입니다.

::source{path="packages/zod-crud/src/selection/json-selection.ts" lines="18-38" title="normalizeSelection"}

## create와 append

`create(parentId, key, value)`는 object child나 array child를 만듭니다. `appendChild(parentId, value)`는 parent가 배열이면 배열 끝에 넣고, object인 경우에는 설정된 child array key를 찾아 그 배열에 append합니다. 이 옵션은 tree-like object 모델에서 자주 필요합니다.

::source{path="packages/zod-crud/src/crud/json-mutations.ts" lines="62-84" title="create"}

::source{path="packages/zod-crud/src/crud/json-mutations.ts" lines="126-155" title="appendChild"}

## insertBefore와 insertAfter

배열 sibling 옆에 삽입할 때는 sibling node id를 기준으로 동작합니다. 루트 옆에는 삽입할 수 없고, sibling의 parent가 배열이 아니면 실패합니다. 이 제한은 object key와 array index의 의미를 섞지 않기 위한 것입니다.

::source{path="packages/zod-crud/src/crud/json-mutations.ts" lines="86-124" title="sibling insertion"}

## update

`update(nodeId, value)`는 먼저 해당 node path의 schema로 값을 검증한 뒤 subtree를 교체합니다. 교체 후에는 전체 document 검증과 exact match 검증을 다시 거칩니다.

::source{path="packages/zod-crud/src/crud/json-mutations.ts" lines="157-174" title="update"}

## rename

`rename(nodeId, key)`는 object child key만 바꿀 수 있습니다. 루트는 이름을 가질 수 없고, 배열 child는 key가 인덱스이므로 rename 대상이 아닙니다. 같은 object 안에 이미 같은 key가 있으면 실패합니다.

::source{path="packages/zod-crud/src/crud/json-mutations.ts" lines="176-205" title="rename"}

## delete

루트는 삭제할 수 없습니다. 일반 node 삭제는 subtree 전체를 제거하고, parent가 배열이면 남은 child의 index key를 정규화합니다. 삭제 결과도 parent path와 전체 document 검증을 통과해야 commit됩니다.

::source{path="packages/zod-crud/src/crud/json-mutations.ts" lines="207-236" title="delete"}

## move / reorder

`moveBefore`, `moveAfter`, `moveInto`는 clipboard를 건드리지 않는 이동 명령입니다. drag/drop, reorder, command palette 같은 상위 UI는 이 API를 사용해 selection을 다른 위치로 이동시킬 수 있습니다. history에는 하나의 commit으로 들어가고, 결과에는 moved node 기준의 focus recovery가 들어갑니다.

::source{path="packages/zod-crud/src/clipboard/json-move.ts" lines="41-75" title="move API"}

::source{path="packages/zod-crud/src/clipboard/json-move.ts" lines="106-157" title="move planning"}

## preflight

`canCreate`, `canUpdate`, `canMoveInto` 같은 preflight는 실행과 같은 검증 경로를 사용하지만 document를 바꾸지 않습니다. 실패하면 같은 failure shape을 돌려주고, 성공하면 `{ ok: true }`를 돌려줍니다.

::source{path="packages/zod-crud/src/json-crud.ts" lines="198-235" title="can* preflight"}

## subscribe

`subscribe`는 성공 commit 이후에 호출되는 listener를 등록합니다. 반환값은 unsubscribe 함수입니다. React에서는 `useEffect`에서 등록하고 cleanup으로 해제하면 됩니다.

::source{path="packages/zod-crud/src/json-crud.ts" lines="320-330" title="subscribe"}
