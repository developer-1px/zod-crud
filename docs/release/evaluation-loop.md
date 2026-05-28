# 평가 루프 기록

목표: 릴리스 전 문서, 데모, 공개 API 계약을 반복 검토해 사용자 관점의 혼란과 drift를 제거한다.

진행: 141 / 100 루프 완료.

## 루프 인정 기준

한 루프는 세 가지가 모두 있어야 인정한다.

- 평가: 사용자가 겪을 혼란, 빠진 증거, stale API 이름을 명명한다.
- 실행: 문서, 데모, 테스트, 검증 스크립트 중 하나 이상을 실제로 바꾼다.
- 점수: 바뀐 뒤 어떤 축이 좋아졌는지 증거를 남긴다.

## 점수 축

| 축 | 통과 증거 |
| --- | --- |
| API 정확성 | 문서와 데모가 현재 공개 API만 사용하고 private module이나 stale name을 쓰지 않는다. |
| target 명확성 | raw insertion pointer와 `{ before | after | replace }` value-relative target을 섞지 않는다. |
| 작업 발견성 | 실제 편집 작업을 검증할 action을 사용자가 찾을 수 있다. |
| 상태 관찰성 | selection, clipboard, result, state, patch 효과를 action 뒤에 확인할 수 있다. |
| LLM 복사성 | 예제를 복사해도 mutation 결과를 다시 commit하거나 `{ at }` 같은 옛 target을 쓰지 않는다. |
| runtime 건강도 | typecheck, test, build, browser check가 바뀐 표면을 덮는다. |
| 성능 회귀 | core 편집 workload가 재현 가능한 측정과 targeted test를 가진다. |

## 누적 요약

| 범위 | 중심 이슈 | 실행 결과 |
| --- | --- | --- |
| 001-025 | workbench와 문서가 API 표면을 과도하게 surface 중심으로 설명함 | task entrypoint, `can*`, paste target, result, JSONPath 경계, selection/clipboard 흐름을 공개 호출 중심으로 정리 |
| 026-050 | 공개 import 경계와 source layout drift | `zod-crud`, `zod-crud/react`, `public-contract.json`, docs evaluator 기준을 고정 |
| 051-090 | history, selection, clipboard, schema validation의 실제 편집 workload | undo/redo, metadata, pointer tracking, rekey, copy/paste 의미론을 테스트와 문서로 보강 |
| 091-134 | 큰 문서와 batch 편집 성능 | `perf:core`와 benchmark evidence를 추가하고 신뢰된 document state, 구조적 schema fast path, 전체 루트 schema validation fallback 경계를 고정 |
| 135-141 | 1.0 release gate와 foundation gate | `release:check`, `standard:check`, `prepublishOnly`, 1.0 version, 외부 gap 분류를 문서와 검증 스크립트에 묶음 |

## 최종 기록

141번째 루프 기준으로 zod-crud 1.0 패키지 릴리스를 막는 미해결 외부 사용 gap은 없다. 남은 항목은 release blocker가 아니라 adapter, 문서 recipe, 또는 다음 확장 패키지의 입력이다.

## 다음 후보

- root bulk history snapshot path는 좁게 유지한다. nested object나 array batch로 넓히려면 별도 memory-retention audit가 필요하다.
- snapshot lifetime 변경은 p50 restore speed만 보지 말고 retained heap row를 함께 본다.
- small-limit history 변경은 증거가 있는 `limit=1` fast path 수준으로 제한한다.
- URI fragment와 non-string selection point는 안정적인 replace tracking에서 fallback-only로 둔다.
- JSON Pointer의 canonical `~0`, `~1` escape는 유지하고 noncanonical fallback 최적화는 별도 workload 증거가 있을 때만 한다.
- `applyPatch`와 외부 clipboard write는 명시적인 외부 JSON 경계로 유지한다.
