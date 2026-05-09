# 스키마 안전성

## zod-crud가 말하는 안전성

`zod-crud`에서 안전하다는 말은 "Zod가 에러를 내지 않았다"보다 더 강합니다. 후보 document를 JSON으로 역직렬화하고 루트 스키마로 parse한 뒤, parse output이 후보 JSON과 정확히 같아야 합니다. Zod가 기본값을 넣거나, 문자열을 숫자로 coerce하거나, 알 수 없는 key를 strip하거나, transform으로 값을 바꾸면 같은 JSON이 아니므로 commit이 거절될 수 있습니다.

이 규칙은 편집기 내부 상태를 신뢰 가능하게 만들기 위한 것입니다. 저장된 document는 항상 "사용자가 보는 JSON"과 "스키마가 인정한 JSON"이 동일해야 합니다.

## 부분 검증과 전체 검증

일부 mutation은 먼저 해당 경로의 schema를 찾아 값 하나를 검증합니다. 하지만 최종 commit 전에는 document 전체를 다시 검증합니다. 부분 검증은 빠른 실패를 위한 것이고, 전체 검증은 최종 불변식입니다.

::source{path="packages/zod-crud/src/schema/json-validation.ts" lines="16-40" title="validateAtPath"}

## parse output exact match

전체 검증의 핵심은 `sameJson(result.data, value)`입니다. Zod parse 결과와 후보 JSON이 다르면 스키마는 통과했더라도 document drift로 봅니다.

::source{path="packages/zod-crud/src/schema/json-validation.ts" lines="43-67" title="validateDocument"}

## commit은 검증 뒤에만 발생합니다

mutation은 `commitIfValid`를 통해서만 현재 document가 됩니다. 검증이 실패하면 실패 결과를 반환하고, 성공하면 history entry와 change diff를 만들고 commit합니다.

::source{path="packages/zod-crud/src/editor/json-crud.ts" lines="272-290" title="commitIfValid"}

## 거절되는 값의 실제 예

아래 예제는 `count`가 0 이상 100 이하의 정수여야 한다는 스키마를 둡니다. UI에서 `999`를 입력하면 `crud.update`는 실패 결과를 반환하고 현재 document는 그대로 유지됩니다. 이 예제 역시 문서에 복사한 코드가 아니라 실제 데모 파일입니다.

::source{path="apps/site/src/examples/RejectedDrift.tsx" lines="1-55" title="RejectedDrift.tsx"}

## 실패 결과를 UI에 보여주기

모든 mutation은 성공과 실패를 구분하는 `OperationResult`를 반환합니다. 실패한 경우에는 사람이 읽을 `reason`, 기계가 분기할 수 있는 `code`, 선택적인 `nodeId`, `path`, `ZodError`가 들어갑니다. UI는 exception 중심 흐름이 아니라 결과값 중심 흐름으로 사용자에게 거절 이유를 보여줄 수 있습니다.

::source{path="packages/zod-crud/src/types.ts" lines="66-109" title="OperationResult"}
