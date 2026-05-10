# Standards Coverage — RFC ↔ core/* 1:1 매핑

zod-crud 의 정체성: **편집 어휘를 JSON 표준과 매핑하여 재사용 가능한 표준 레이어**.
본 문서는 그 매핑의 **추적 가능한 단일 표** 다.

원칙: **표준 1개 = `core/*` 폴더 1개**. 새 표준 진입 시 새 폴더, 폴더 합치지 않는다.

## 매핑 표

| 표준 | 영역 | `core/*` 폴더 | 정합 시점 | 외부 의존 |
|------|------|----------------|------------|-----------|
| **RFC 6901** — JSON Pointer | path 표현 (단일·정확) | `core/pointer/` | 절대 | 없음 |
| **RFC 6902** — JSON Patch | 변경 표현 (6 op) | `core/patch/` | 절대 | 없음 |
| **RFC 9535** — JSONPath | path 표현 (query·다중) | `core/jsonpath/` | 절대 | 없음 (자체 구현) |
| **RFC 8259** — JSON | fragment 직렬화 | (`JSON.stringify` ECMAScript built-in) | 절대 | 없음 |
| **W3C Selection API** | selection 좌표 어휘 | `core/selection/` | 절대 | 없음 |
| **WAI-ARIA Authoring Practices** — Listbox / Tree / Grid / TreeGrid | selection mode · `aria-selected` 의미 | `core/selection/` (어휘만 차용) | 절대 | 없음 |
| **RFC 8927 / draft-bhutton** — JSON Schema | schema 외부 다리 | `core/schema/` | 절대 | Zod |
| **RFC 5789** — HTTP PATCH | 서버 통신 | `sidecars/http.ts` | 옵셔널 | 없음 |
| **RFC 7396** — JSON Merge Patch | merge 의미 (wire only) | `sidecars/http.ts` | 옵셔널 | 없음 |

## core/ 폴더 목록 (표 ↔ 디렉터리 1:1)

```
core/
├── pointer/      RFC 6901
├── patch/        RFC 6902
├── jsonpath/     RFC 9535     (Phase 6 신설)
├── selection/    W3C Selection + WAI-ARIA
├── schema/       RFC 8927 + Zod
├── history.ts    RFC 6902 inverse + history stack    (pure reducer, single-concept)
└── track.ts      RFC 6902 op 적용 후 Pointer follow (인프라)
```

## sidecars/ (횡단 관심사 — 표준이 아닌 transport / observability)

```
sidecars/
├── http.ts       RFC 5789 + 6902 + 7396 wire format
├── recorder.ts   commit stream → Recording (직렬화 / replay)
└── debug-log.ts  cross-cutting trace
```

## 자동 검증 (Phase 8)

`test:standards-coverage` 스크립트가 본 표의 `core/*` 컬럼과 실제 디렉터리 구조를 비교한다 (Phase 8.1, #51).

- 표에 있는 폴더가 코드에 없음 → CI 실패 (구현 누락)
- 코드의 폴더가 표에 없음 → CI 실패 (표준 정합 근거 없는 폴더)

## 외부 의존 통제

`core/schema/` 의 Zod 만 외부 의존. 다른 모든 `core/*` 는 외부 dep 0.
RFC 9535 (JSONPath) 도 외부 라이브러리 의존하지 않고 **자체 구현** (RFC 9535 conformance suite 통과 목표).

## 신규 표준 진입 절차

1. 본 표에 행 추가 (표준 이름 + 영역 + 폴더 경로)
2. `core/<폴더>/` 신설 (RFC 정합)
3. `verbs/*` 또는 `hooks/*` 가 substrate 사용
4. `test:standards-coverage` 통과 확인

표준이 아닌 임시 / 휴리스틱 / 실용 어휘는 `core/` 진입 거부. `sidecars/` 도 transport / observability 외엔 진입 거부.
