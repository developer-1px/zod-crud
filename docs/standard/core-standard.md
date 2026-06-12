# json-document 코어 표준

상태: 표준화 트랙 초안.

이 문서는 `@interactive-os/json-document` 공개 API가 특정 구현체의 사용 설명을 넘어,
headless JSON 편집 도구의 foundation 계약으로 쓰일 수 있는지를 정의한다.
패키지 구현은 기준 구현이지만, 이 문서는 구현 파일을 몰라도 검토할 수
있는 의미론 계약이어야 한다.

## 1. 규범 언어

`MUST`, `MUST NOT`, `SHOULD`, `SHOULD NOT`, `MAY`는 규범 키워드다.

어떤 구현체가 json-document 호환이라고 주장하려면 이 문서와 적합성
suite를 통과해야 한다. README와 사이트 문서는 사용법을 설명할 수 있지만,
의미론 계약의 기준은 이 문서다.

## 2. 범위

json-document는 schema로 보호되는 JSON 상태 위에서 동작하는 headless 편집
foundation이다.

표준에 포함되는 책임은 다음과 같다.

- JSON 상태, JSON Patch 변경, JSON Pointer 주소, JSONPath 검색.
- schema 검증과 schema introspection.
- document 읽기, 쓰기, 구독, 원자적 실패 처리.
- 이유를 포함하는 capability probe.
- headless selection snapshot과 selection 변경.
- headless clipboard buffer와 copy/cut/paste 의미론.
- 직렬화 가능한 metadata를 가진 undo/redo history.
- 같은 document 표면을 노출하는 선택적 React adapter.

표준에서 제외되는 책임은 다음과 같다.

- DOM focus, rendering, layout, visual selection, keyboard policy, drag and drop,
  command palette, system clipboard 연결.
- 원격 협업 전송, 저장 protocol, CRDT/OT conflict resolution, 앱별 command 이름.

제외된 책임도 공개 계약만으로 adapter가 구현할 수 있어야 한다.

## 3. 적합성 등급

core 적합성은 root `@interactive-os/json-document` entrypoint를 대상으로 한다.

React 적합성은 별도로 주장할 수 있으며, `@interactive-os/json-document/react` entrypoint만
대상으로 한다.

호환 구현체는 consumer에게 private module이나 구현 파일 경로 import를
요구하면 안 된다.

## 4. 데이터 모델

document state는 RFC 8259와 ECMA-404의 JSON data여야 한다.

patch operation, clipboard payload, selection snapshot, history metadata는
명시적인 trusted boundary API를 사용하지 않는 한 JSON-serializable이어야
한다.

공개 JSON boundary는 function, symbol, accessor, non-plain object, 기타
JSON이 아닌 값을 거부해야 한다.

## 5. 주소, 검색, 변경

patch path는 JSON Pointer 문자열이어야 한다.

query input은 JSONPath여야 한다.

query output은 JSON Pointer 문자열이어야 한다.

JSONPath는 mutation target으로 받아들이면 안 된다.

구현체는 RFC 6902의 `add`, `remove`, `replace`, `move`, `copy`, `test`
의미론을 지원해야 한다. patch가 실패하면 원자적이어야 한다. 즉 state,
selection, clipboard, history, subscriber는 부분 적용을 관측하면 안 된다.

## 6. Schema 의미론

schema는 document가 받아들일 수 있는 shape를 정의한다.

초기 document 생성은 caller가 explicit trusted-initial boundary를 사용하지
않는 한 초기 값을 검증해야 한다.

mutation API는 성공 결과를 commit하기 전에 결과 document를 schema로
검증해야 한다.

schema capability와 introspection 결과는 document data에는
`document-result` path를, schema 위치에는 `schema-slot` path를 써야 한다.

## 7. Document 표면

호환 document는 다음 표면을 노출해야 한다.

- `value`
- `lastPatch`
- `selection`
- `clipboard`
- `history`
- `schema`
- `patch`
- `commit`
- `find`
- `insert`
- `replace`
- `delete`
- `move`
- `duplicate`
- `copy`
- `cut`
- `paste`
- `undo`
- `redo`
- `load`
- `reset`
- `subscribe`
- `at`
- `exists`
- `query`
- `entries`
- `canPatch`
- `canFind`
- `canInsert`
- `canReplace`
- `canDelete`
- `canMove`
- `canDuplicate`
- `canCopy`
- `canCut`
- `canPaste`
- `canUndo`
- `canRedo`

document 표면은 flat하게 유지하는 편이 좋다. adapter는 convenience layer를
만들 수 있지만, core 계약 사용에 그 layer가 필요해서는 안 된다.

## 8. 실행과 Capability

`patch`, `commit`, `load`, `reset`, `undo`, `redo`는 document execution method다.

execution method는 전체 변경을 commit하거나 아무것도 commit하지 않아야
한다.

`strict`는 `patch`, `commit`, `load`, `reset`의 execution failure에만 적용된다.
기본값은 `strict: false`다. `strict: true`에서 처리된 execution failure는
`JSONDocumentError`를 throw해야 한다. non-strict mode에서는 실패한 `JSONResult`를
반환해야 한다. `onError`는 throw나 return보다 먼저 실행되어야 한다.

`undo`와 `redo`는 top-level document command로 `JSONCapabilityResult`를 반환해야
한다. Low-level `doc.history.undo()`와 `doc.history.redo()`는 history control
surface로 boolean을 유지할 수 있다.

`can*` method는 state를 바꾸면 안 된다. boolean이 아니라 이유를 담은
capability result를 반환해야 한다.

`can*` method는 자신이 미리 보는 execution path와 같은 검증 의미론을
공유하는 편이 좋다.

## 9. Selection

selection은 DOM focus가 아니라 headless document data다.

selection snapshot은 JSON-serializable이어야 하며 selected pointer, range,
primary index, anchor, focus, optional context를 복원할 수 있어야 한다.

selection operation은 JSON Pointer 주소를 사용해야 한다.

document patch 이후 selection tracking은 살아남은 target을 보존해야 하며,
무효 selection은 문서화된 patch semantics에 따라 제거하거나 재지정해야
한다.

`commit`은 explicit final selection snapshot을 받을 수 있다. 제공된 경우
patch와 final selection은 하나의 history entry로 원자적으로 기록되어야
한다.

## 10. Clipboard

clipboard는 document instance가 소유하는 headless buffer다.

core clipboard는 browser, system, DOM clipboard 접근을 요구하면 안 된다.
adapter는 headless buffer를 host clipboard API에 연결할 수 있다.

여러 source에서 copy/cut하면 ordered array payload와 source pointer list를
저장해야 한다.

multi-source clipboard buffer를 array insertion target에 paste하면 기본적으로
저장된 item을 spread해야 한다.

직접 `paste(target, { payload })`에 array payload를 넘긴 경우 기본적으로
spread하면 안 된다. caller가 명시적으로 spread를 요청한 경우에만
spread해야 한다.

paste failure는 원자적이어야 한다.

## 11. History

history는 undo/redo control surface이며, public history-entry inspector가
아니다.

history metadata는 JSON-serializable이어야 한다.

undo와 redo는 원자적이어야 하며 document value와 selection을 기록된 상태로
복원해야 한다.

transaction은 여러 execution call을 하나의 history step으로 병합할 수
있지만, validation batching 기능으로 문서화하면 안 된다. 알려진 burst edit은
operation array를 `commit`으로 적용하는 편이 좋다.

## 12. 공개 계약 안정성

package export list는 machine-readable 공개 계약으로 잠겨야 한다.

공개 export 제거, 공개 result shape 변경, error code 변경, atomicity
변경, 기본 spread 의미론 변경, strict 의미론 변경은 breaking change로
취급해야 한다.

새 core concept을 추가하려면 document, schema, patch, pointer, query,
selection, clipboard, history, capability라는 기존 concept으로 요구사항을
표현할 수 없다는 증거가 있어야 한다.

## 13. Adapter 압력

foundation 주장은 하나의 UI로 성립하지 않는다. 같은 core concept을 다음
adapter에서 압박 검증해야 한다.

- form editing
- table 또는 data-grid editing
- outliner 또는 tree editing
- rich-text/editor bridge
- storage, history, collaboration bridge

adapter가 새 core concept을 요구한다면 public requirement, 기존 concept으로
시도한 표현, 실패한 이유를 함께 제시해야 한다.

## 14. 적합성

적합성 suite는 public package entrypoint에서만 import해야 한다.

적합성 suite는 정상 동작, 실패 동작, atomicity, JSON serializability,
capability purity, selection snapshot, clipboard spread semantics, history
round-trip을 다뤄야 한다.

일반 구현 테스트를 통과하는 것만으로는 표준 적합성을 주장할 수 없다.
json-document 호환 구현체는 implementation-private module 없이 적합성 suite를
통과해야 한다.
