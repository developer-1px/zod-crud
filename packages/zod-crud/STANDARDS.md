# Standards Coverage — RFC ↔ core/* 1:1 매핑

zod-crud 의 정체성: **편집 어휘를 JSON 표준과 매핑하여 재사용 가능한 표준 레이어**.
본 문서는 그 매핑의 **추적 가능한 단일 표** 다.

## 원칙

**1 substrate = 1 단위** (폴더 또는 단일 파일).

- multi-file substrate (parser/evaluator/types 등 분할이 있는 RFC) → `core/<name>/` **폴더**
- single-file substrate (개념이 작거나 단일 reducer) → `core/<name>.ts` **파일**

derived substrate (다른 RFC 위에 얹힌 것 — 예: history = RFC 6902 inverse + stack reducer; track = RFC 6902 op 적용 후 Pointer follow) 도 같은 규칙으로 본다.

## 매핑 표

| 표준 / Substrate | 영역 | 위치 | 정합 시점 | 외부 의존 |
|------|------|------|-----------|-----------|
| **RFC 6901** — JSON Pointer | path 표현 (단일·정확) | `core/pointer/` | 절대 | 없음 |
| **RFC 6902** — JSON Patch | 변경 표현 (6 op) | `core/patch/` | 절대 | 없음 |
| **RFC 9535** — JSONPath | path 표현 (query·다중) | `core/jsonpath/` | 절대 | 없음 (자체 구현) |
| **RFC 8259** — JSON | JSON 값 경계 + 직렬화 | `core/json.ts` + `JSON.stringify` ECMAScript built-in | 절대 | 없음 |
| **W3C Selection API** | selection 좌표 어휘 | `core/selection/` | 절대 | 없음 |
| **WAI-ARIA APG** — Listbox / Tree / Grid / TreeGrid | selection mode · `aria-selected` 의미 | `core/selection/` (어휘만 차용) | 절대 | 없음 |
| **RFC 8927 / draft-bhutton** — JSON Schema | schema 외부 다리 | `core/schema/` | 절대 | Zod |
| **RFC 6902 inverse + history stack** (derived) | undo/redo 데이터 구조 | `core/history.ts` | 절대 | 없음 |
| **RFC 6902 op-aware Pointer follow** (derived) | patch 적용 후 selection/pointer 자동 추적 인프라 | `core/track.ts` | 절대 | 없음 |

## core/ 폴더 목록 (표 ↔ 디렉터리 1:1)

```
core/
├── pointer/      RFC 6901
├── patch/        RFC 6902
├── jsonpath/     RFC 9535     (Phase 6 신설)
├── selection/    W3C Selection + WAI-ARIA
├── schema/       RFC 8927 + Zod
├── json.ts       RFC 8259 JSON 값 경계
├── history.ts    RFC 6902 inverse + history stack    (pure reducer, single-concept)
└── track.ts      RFC 6902 op 적용 후 Pointer follow (인프라)
```

## commands/ (facade builders, pure)

`useJSONDocument.commands` / `useJSONDocument.can` group 의 빌더. React 무관 — `hooks/` 에 없음 (셀프 점검 결과 분리, 2026-05-10).

```
commands/
├── buildCommands.ts   Commands<T> 빌더 — 10 verb namespace
└── buildCan.ts        Can<T> 빌더 — preFlight 가드 namespace
```

**진입 거부 규칙:**
- `core/*` 진입 — 표준 RFC 또는 derived substrate 만. 임시/실용 휴리스틱 거부.
- 관찰·transport 도구는 라이브러리 본체 진입 거부. 앱/playground/debug tooling 에 둔다.

## 자동 검증 (Phase 8)

`test:standards-coverage` 스크립트가 본 표의 `core/*` 컬럼과 실제 디렉터리 구조를 비교한다 (Phase 8.1, #51).

- 표에 있는 폴더가 코드에 없음 → CI 실패 (구현 누락)
- 코드의 폴더가 표에 없음 → CI 실패 (표준 정합 근거 없는 폴더)

## 외부 의존 통제

`core/schema/` 의 Zod 만 외부 의존. 다른 모든 `core/*` 는 외부 dep 0.
RFC 9535 (JSONPath) 도 외부 라이브러리 의존하지 않고 **자체 구현** (RFC 9535 conformance suite 통과 목표).

## 신규 표준 진입 절차

1. 본 표에 행 추가 (표준 이름 + 영역 + 위치)
2. `core/<name>/` 폴더 (multi-file) 또는 `core/<name>.ts` 파일 (single-file) 신설
3. `verbs/*` 또는 `hooks/*` 가 substrate 사용
4. `test:standards-coverage` 통과 확인

표준이 아닌 임시 / 휴리스틱 / 실용 어휘는 `core/` 진입 거부. 관찰·transport 도구도 라이브러리 본체 진입 거부.
