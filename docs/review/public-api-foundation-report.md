# 공개 API Foundation 검토 보고서

날짜: 2026-05-28

기준 문서: `docs/review/public-api-foundation-protocol.md`

목표: 현재 `zod-crud` 공개 API가 앞으로의 편집 도구를 만들 때 최소 개념으로 최대 확장을 감당하는 foundation인지 검토한다.

## 검토 입력

검토는 내부 구현 파일이 아니라 공개 계약 자료에서 시작했다.

- `llms.txt`
- `packages/zod-crud/public-contract.json`
- `packages/zod-crud/README.md`
- `apps/site/src/docs/zod-crud-concepts.md`
- `apps/site/src/docs/zod-crud-api.md`
- workbench와 데모 테스트의 공개 동작

내부 구현은 판단의 출발점으로 쓰지 않았다. 구현을 본 경우에도 공개 API 의미론을 확인하기 위한 증거로만 사용했다.

## 검토 방식

네 관점에서 같은 루프를 반복했다.

```txt
요구사항
`-- 공개 개념으로 표현 시도
    `-- 비판
        `-- 대안 또는 반례
            `-- 증거 확인
                `-- 등급과 심각도 분류
```

| 관점 | 압박한 요구 |
| --- | --- |
| 폼과 검증 | invalid draft, validation projection, grid, TSV, system clipboard |
| 트리와 에디터 | outliner, visible-row focus, rich editor bridge |
| 저장과 협업 | patch stream, metadata, scoped undo, command composition |
| 계약과 이름 | import boundary, result semantics, type spelling, 문서 발견성 |

## 결론

이번 루프에서 공개 API를 동결하면 안 된다고 볼 만한 `S0` 차단 이슈는 나오지 않았다.

핵심 결론은 “완벽하다”가 아니라 “core concept을 늘릴 근거는 아직 없다”이다. 발견된 문제는 대부분 기존 개념을 더 명확히 설명하거나 adapter 책임으로 분리하면 해결된다.

```txt
zod-crud 공개 API
|-- concept 최소성: 통과
|-- import boundary: 통과
|-- UI 비소유 원칙: 통과
|-- adapter 확장성: 통과
|-- 문서 명확성: 보완 필요
`-- foundation 선언 전 필요 작업
    |-- 검증 오류 path 의미 고정
    |-- strict와 JSONCrudError 정책 고정
    |-- history metadata 읽기 모델 고정
    `-- 공개 type 이름 최종 점검
```

## 등급 요약

| 등급 | 건수 | 뜻 |
| --- | ---: | --- |
| A | 0 | 공개 core로 표현할 수 없는 요구가 증명됨 |
| B | 9 | API는 표현 가능하지만 문서나 계약 설명이 부족함 |
| C | 6 | 반복되는 adapter 또는 확장 패키지 후보 |
| D | 2 | 제품 UI 정책이므로 core 밖에 두어야 함 |
| E | 1 | 현재 공개 API 증거로 반박된 비판 |

| 심각도 | 건수 | 영향 |
| --- | ---: | --- |
| S0 | 0 | API freeze 차단 |
| S1 | 4 | foundation 선언 전 명확화 필요 |
| S2 | 11 | 도입과 확장성 설명 보강 |
| S3 | 2 | 앱 또는 데모 안내 |
| S4 | 1 | 기각된 비판 |

## 동결 전 위험

### R1. 검증 오류 path 기준

`violations[].path`가 어떤 좌표인지 명확해야 한다.

- `doc.schema.accepts(...)`는 요청한 schema 위치 기준인 `schema-slot` path를 돌려준다.
- `canPatch`, `canPastePayload`, `canPaste`, `canDuplicate`는 patch preview 뒤 실제 문서 위치 기준인 `document-result` path를 돌려준다.
- `/items/-`처럼 삽입 위치를 쓰면 mutation preflight는 `/items/2/name` 같은 실제 index로 보고해야 한다.

판정: 새 concept이 아니라 문서 의미론 보강이다.

### R2. strict 실패 정책

`can*`는 항상 이유 있는 `Result`를 돌려준다. 반면 `doc.patch`, `doc.commit`, `doc.load`, `doc.reset`은 `strict` 정책에 따라 실패 `JSONResult`를 반환하거나 `JSONCrudError`를 던진다.

판정: 공개 API는 충분하지만, 사용자 문서가 이 차이를 앞에서 설명해야 한다.

### R3. history metadata 읽기 모델

공개 history는 undo/redo 제어 표면이지 history entry inspector가 아니다. command label, audit log, collaboration adapter가 metadata를 보관해야 하면 `doc.subscribe((patch, metadata) => ...)`로 패치 스트림을 mirror해야 한다.

판정: 새 core concept은 필요하지 않다. 문서에서 command/action layer 책임을 명확히 둔다.

### R4. 공개 type 이름

공개 type 이름은 freeze 이후 바꾸기 어렵다. 내부 약어가 공개 이름에 새면 breaking change가 된다.

판정: `packages/zod-crud/public-contract.json`, package smoke, docs consistency, `docs:evaluate`가 같은 공개 계약을 읽도록 고정했다.

## 요구별 판정

| 요구 | 판정 | 근거 |
| --- | --- | --- |
| schema 기반 form invalid draft | core 밖 app draft state와 `doc.schema.accepts`, `canReplace`, `canPatch`로 표현 가능 |
| validation projection | `violations[].path`, `schema-slot`, `document-result` 규칙을 문서화하면 충분 |
| table/grid selection | headless selection과 adapter pointer list로 표현 가능 |
| TSV/system clipboard | core clipboard는 headless buffer, system clipboard는 adapter 책임 |
| outliner/tree move | JSON Pointer와 JSON Patch `move`로 표현 가능 |
| visible row focus | DOM focus와 row visibility는 앱 책임 |
| rich editor bridge | text selection planning은 core가 제공하되 editor state bridge는 확장 후보 |
| storage/collaboration | `doc.subscribe` patch stream과 metadata로 adapter 구현 가능 |
| scoped undo | core history가 아니라 storage/collaboration 확장 후보 |
| command palette | command registry와 keyboard policy는 앱 책임 |
| CRDT/semantic merge | core patch engine 요구가 아니라 별도 collaboration layer 책임 |

## 최종 판정

현재 공개 API는 foundation 후보로 볼 수 있다. 다만 “표준화 레벨 foundation”으로 선언하려면 다음 게이트를 계속 통과해야 한다.

1. `docs/standard/core-standard.md`의 규범 의미론 유지.
2. `packages/zod-crud/tests/public/standard-conformance.test.ts` 통과.
3. `docs:evaluate`, docs consistency, package smoke가 같은 `public-contract.json`을 기준으로 통과.
4. adapter 압박에서 새 core concept 요구가 나올 때 기존 document, schema, patch, pointer, query, selection, clipboard, history, capability로 먼저 표현 실패가 증명될 것.
