# 클립보드와 히스토리

## 같은 commit 규칙 위의 clipboard

clipboard는 단순히 값을 메모리에 담는 기능이 아닙니다. copy는 subtree JSON을 복사하고, cut은 삭제가 성공했을 때만 clipboard를 갱신합니다. paste는 가능한 후보를 만들고, 그중 스키마와 exact match 규칙을 통과하는 첫 후보만 commit합니다.

Move/reorder는 clipboard와 분리했습니다. 같은 node selection을 움직이더라도 `moveBefore`, `moveAfter`, `moveInto`는 clipboard payload를 바꾸지 않으므로, 사용자가 복사해 둔 값은 move 이후에도 그대로 paste할 수 있습니다.

## copy와 copyMany

`copy`는 선택한 node의 JSON subtree를 읽어 clipboard에 저장합니다. `copyMany`는 중복이나 descendant 관계를 정리한 unique node 목록을 기준으로 여러 값을 저장합니다.

::source{path="packages/zod-crud/src/editor/json-clipboard.ts" lines="69-96" title="copy APIs"}

## cut과 cutMany

`cut`은 root를 대상으로 할 수 없습니다. 삭제가 성공한 뒤에만 clipboard가 갱신되므로, 스키마상 삭제가 불가능한 노드를 잘랐다고 해서 clipboard가 오염되지 않습니다.

::source{path="packages/zod-crud/src/editor/json-clipboard.ts" lines="98-135" title="cut APIs"}

## paste와 canPaste

`paste`는 clipboard가 비어 있으면 실패합니다. `canPaste`는 실제 commit 없이 같은 candidate build와 validation을 수행하고 allocator 상태를 복구합니다. UI는 이 결과로 paste 버튼을 활성화하거나 비활성화할 수 있습니다.

::source{path="packages/zod-crud/src/editor/json-clipboard.ts" lines="137-167" title="paste APIs"}

## paste candidate

`auto` mode에서는 먼저 자기 자신 또는 sibling paste 후보를 만들고, child paste 후보를 이어 붙입니다. target이 array면 child paste가 자연스럽고, object나 같은 primitive 타입이면 overwrite 후보가 생길 수 있습니다. 명시적으로 `child`나 `overwrite` mode를 주면 후보 생성 방향을 좁힐 수 있습니다.

::source{path="packages/zod-crud/src/editor/json-paste.ts" lines="19-77" title="buildPasteCandidates"}

## 첫 번째 유효 paste만 commit

candidate가 여러 개여도 실제 commit은 하나입니다. 후보를 적용해보고 document validation이 성공하면 change diff를 만들고 commit합니다. 실패한 후보는 allocator를 되돌리고 다음 후보를 시도합니다. 모든 후보가 실패하면 전체 paste도 실패합니다.

::source{path="packages/zod-crud/src/editor/json-clipboard.ts" lines="202-239" title="commitFirstValidPaste"}

## history

history는 commit 전에 현재 document를 undo stack에 저장하고 redo stack을 비웁니다. undo는 이전 document로 되돌리고 현재 document를 redo stack에 넣습니다. redo는 그 반대입니다. 둘 다 `OperationResult`를 반환하고 subscriber를 호출합니다.

::source{path="packages/zod-crud/src/editor/json-history.ts" lines="46-114" title="history commit / undo / redo"}

## clipboard를 건드리지 않는 move

Move는 cut/paste의 조합이 아니라 별도 command입니다. 이 차이 때문에 clipboard state와 history transaction의 의미가 분리됩니다.

::source{path="packages/zod-crud/src/editor/json-move.ts" lines="261-335" title="moveToArray"}

## clipboard와 history를 함께 쓰는 예제

아래 데모는 배열 원소를 선택하고 copy, cut, paste, delete, undo, redo를 실행합니다. 실제 사이트 예제 파일에서 그대로 가져옵니다.

::source{path="apps/site/src/examples/ClipboardArray.tsx" lines="1-53" title="ClipboardArray.tsx"}
