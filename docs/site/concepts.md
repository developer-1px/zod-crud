# 핵심 개념

## 전체 흐름

`zod-crud`의 commit pipeline은 값 편집을 낙관적으로 적용하지 않습니다. 먼저 후보 document를 만들고, 스키마로 검증하고, parse output과 저장 JSON이 동일한지 확인한 뒤에야 현재 document로 교체합니다.

```txt
input JSON
  -> root schema safeParse()
  -> parsed JSON output
  -> serialize() into JsonDoc
  -> node-id CRUD / clipboard / undo / redo
  -> candidate JsonDoc
  -> deserialize()
  -> root schema safeParse()
  -> exact parsed-output comparison
  -> commit or reject
```

## JsonValue

라이브러리는 JSON으로 표현 가능한 값만 다룹니다. 함수, Date, Map, Set, class instance 같은 런타임 객체는 도메인 바깥입니다. Zod transform이 그런 값을 만들거나 coercion으로 값을 바꾸는 경우도 저장된 JSON과 parse output이 달라질 수 있으므로 commit이 거절될 수 있습니다.

::source{path="packages/zod-crud/src/types.ts" lines="3-16" title="JsonValue types"}

## JsonNode와 JsonDoc

`JsonDoc`은 `rootId`와 `nodes` 사전으로 구성됩니다. 각 `JsonNode`는 자신의 id, 타입, 부모 id, key, children, primitive value를 가집니다. 객체와 배열은 `children`으로 구조를 표현하고, primitive 노드는 `value`를 가집니다.

::source{path="packages/zod-crud/src/types.ts" lines="18-34" title="JsonDoc shape"}

## 직렬화와 역직렬화

초기 JSON은 `serialize`를 통해 flat document가 됩니다. 다시 외부로 내보낼 때는 `deserialize`가 object와 array 구조를 복원합니다. object child의 key는 string이어야 하고, duplicate key가 발견되면 역직렬화가 실패합니다.

::source{path="packages/zod-crud/src/document/json-doc-serialization.ts" lines="11-50" title="serialize / deserialize"}

## subtree 생성

객체와 배열은 재귀적으로 하위 노드를 만들고, primitive는 leaf node가 됩니다. 이 방식 덕분에 update나 paste가 하위 subtree 전체를 교체하더라도 document의 나머지 노드는 독립적으로 유지됩니다.

::source{path="packages/zod-crud/src/document/json-doc-serialization.ts" lines="52-110" title="createSubtree"}

## 배열 인덱스 안정성

배열 child의 `key`는 현재 배열 인덱스입니다. 삽입이나 삭제 뒤에는 array key가 다시 정규화됩니다. 그래서 외부 UI는 배열 위치를 장기 상태로 저장하기보다 `NodeId`를 선택 상태로 저장하는 편이 안전합니다.

::source{path="packages/zod-crud/src/document/json-doc-mutations.ts" lines="9-52" title="insertChild"}
