# 공개 API Foundation 검토 프로토콜

이 문서는 zod-crud 공개 API가 편집 도구의 foundation으로 충분한지 검토하는
절차를 정의한다. 목적은 꼬투리 잡기가 아니라, breaking 없이 오래 유지할 수
있는 최소 개념 계약인지 확인하는 것이다.

## 판단 기준

| 기준 | 통과 증거 |
| --- | --- |
| 표현력 | form, table/grid, outliner, rich text, storage adapter 요구를 기존 개념으로 표현할 수 있다. |
| 최소성 | 새 core 개념을 추가하지 않아도 common editing semantic을 설명할 수 있다. |
| 안정성 | 공개 export, result shape, error code, atomicity, default behavior가 semver 기준으로 잠겨 있다. |
| 외부자 이해 | README, site docs, `llms.txt`, `public-contract.json`만 보고 사용할 수 있다. |
| 내부 은닉 | 구현 파일 경로와 internal action/reducer를 몰라도 된다. |

## 검토 입력

검토자는 다음 공개 자료만 기준으로 삼는다.

- `packages/zod-crud/README.md`
- `packages/zod-crud/SPEC.md`
- `apps/site/src/docs/*.md`
- `llms.txt`
- `packages/zod-crud/public-contract.json`
- 공개 tests와 playground가 보여 주는 behavior

내부 source path는 근거가 아니라 구현 확인용 보조 자료다.

## 필수 scenario

다음 scenario는 foundation 압력을 만들기 위해 반복 검토한다.

- form: field edit, validation, dirty state, undo
- table/grid: row/cell edit, batch edit, copy/paste, duplicate
- outliner/tree: nested move, multi-select, sibling/child paste
- rich text/editor bridge: text selection, text patch, schema-safe embedding
- storage/collaboration: patch stream, metadata, optimistic conflict boundary

## 표현 가능성 테스트

새 core 개념을 주장하려면 먼저 기존 개념으로 표현을 시도해야 한다.

```txt
요구사항
|-- document
|-- schema
|-- patch
|-- pointer
|-- query
|-- selection
|-- clipboard
|-- history
`-- capability
```

다음 중 하나가 증명될 때만 core gap으로 본다.

- 기존 concept 조합으로 정상 동작을 표현할 수 없다.
- 표현은 가능하지만 공개 계약과 모순된다.
- 표현은 가능하지만 모든 adapter가 같은 boilerplate를 반복해야 한다.
- workaround가 semver-stable public behavior를 요구한다.

## UI 출발, Core 판단

UI에서 발견한 불편함은 바로 core 요구가 아니다.

| UI 문제 | 먼저 물어볼 질문 |
| --- | --- |
| row focus와 selection 동기화 | JSON Pointer selection으로 표현 가능한가? |
| keyboard shortcut | command adapter 책임인가? |
| DOM focus | headless state로 충분한가? |
| system clipboard | headless clipboard buffer와 adapter로 분리 가능한가? |
| collaboration conflict | patch stream과 metadata로 경계를 만들 수 있는가? |

## Finding 분류

| 분류 | 의미 | 조치 |
| --- | --- | --- |
| A | 현재 공개 core로 common editing semantic을 표현할 수 없음 | freeze 전 수정 또는 명시적 거부 필요 |
| B | 표현은 가능하지만 문서, 이름, result 의미가 freeze하기 불명확함 | freeze 전 정리 |
| C | 유효한 요구지만 core보다 adapter/extension 책임임 | extension backlog |
| D | 근거가 부족하거나 tail-chasing임 | 기각 |

## 심각도

| 등급 | 의미 |
| --- | --- |
| S0 | 공개 API freeze를 막는 correctness blocker |
| S1 | freeze risk. workaround는 있으나 foundation claim을 약하게 함 |
| S2 | 문서, demo, recipe 개선 |
| S3 | 장기 extension 후보 |

## 반복 루프

1. public 자료만 보고 약점을 찾는다.
2. 약점이 A/B/C/D 중 무엇인지 분류한다.
3. A/S0 또는 B/S1은 code, docs, tests 중 적절한 곳에서 고친다.
4. 수정 뒤 같은 조건으로 from-zero 재검토한다.
5. 마지막 S1 수정 뒤 clean loop 2회를 요구한다.

## 통과 조건

zod-crud는 다음을 만족할 때 foundation-complete 후보가 된다.

- 새 A/S0 없음.
- 미해결 B/S1 없음.
- `packages/zod-crud/public-contract.json`이 공개 export SSOT다.
- 공개 docs가 내부 source path를 요구하지 않는다.
- `npm run release:check`가 통과한다.
- `standard:check`가 conformance seed를 통과한다.
- adapter pressure spike에서 새 core 개념 요구가 증거 없이 나오지 않는다.

## 첫 검토 batch

권장 병렬 검토 범위:

1. form/table/data-grid
2. outliner/tree/rich-text bridge
3. history/storage/collaboration
4. naming/result/docs/philosophy
