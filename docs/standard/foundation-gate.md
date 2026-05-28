# RFC급 Foundation 게이트

상태: 활성.

이 게이트는 현재 패키지가 릴리스 가능한지를 묻는 것이 아니라, zod-crud가
편집 도구의 표준 수준 foundation으로 쓰일 수 있는지를 묻는다.

```txt
RFC급 foundation
|-- 규범 표준
|   |-- public semantics가 MUST/SHOULD/MAY로 작성됨
|   |-- 구현 파일 경로를 몰라도 이해 가능함
|   `-- breaking change가 의미론 기준으로 정의됨
|-- conformance
|   |-- 공개 package entrypoint만 import함
|   |-- 성공, 실패, atomicity, JSON boundary를 다룸
|   |-- selection, clipboard, history, schema, capability를 다룸
|   `-- 다른 구현체도 재사용할 수 있음
|-- 상호운용 압력
|   |-- form adapter
|   |-- table/data-grid adapter
|   |-- outliner/tree adapter
|   |-- rich-text/editor bridge
|   `-- storage/collaboration bridge
|-- concept 최소성
|   |-- app command layer를 core에 넣지 않음
|   |-- DOM이나 rendering layer를 core에 넣지 않음
|   |-- remote transport를 core에 넣지 않음
|   `-- adapter gap은 자동 core concept이 아니라 extension 입력으로 다룸
`-- review threshold
    |-- S0 correctness blocker 없음
    |-- S1 foundation-freeze blocker 없음
    `-- 마지막 S1 수정 뒤 from-zero clean review 2회
```

## 현재 산출물

| 게이트 | 산출물 | 상태 |
| --- | --- | --- |
| 규범 표준 | `docs/standard/core-standard.md` | 초안 추가 |
| export lock | `packages/zod-crud/public-contract.json` | 활성 |
| 의미론 conformance | `packages/zod-crud/tests/public/standard-conformance.test.ts` | 활성 |
| 표준화 evaluator | `scripts/evaluate-standardization.mjs` | 활성 |
| 릴리스 기계 검증 | `npm run release:check` | 활성 |

## 남은 압력 검증

| adapter 압력 | 필요한 증거 |
| --- | --- |
| form | field read/write, validation, dirty state, selection/focus adapter, undo |
| table/data-grid | row/cell addressing, batch edit, copy/paste, duplicate, undo |
| outliner/tree | hierarchy move, nested insert/remove, multi-select, clipboard |
| rich text/editor bridge | text selection, text patch planning, schema-safe document embedding |
| storage/collaboration | patch stream persistence, metadata, optimistic conflict boundary |

각 압력 spike는 먼저 기존 표준 concept인 document, schema, patch, pointer,
query, selection, clipboard, history, capability로 요구를 표현해 봐야 한다.
새 core concept은 그 표현이 증거와 함께 실패한 뒤에만 허용한다.
