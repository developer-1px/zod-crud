# ADR 0002 — Charter rewording: 편집 어휘 wrapper as the canonical identity

**Status**: Accepted (2026-05-10)
**Supersedes**: ADR-0001 (removed; obsolete vocabulary was folded into this ADR)
**Superseded by**: —

## Context

An earlier ADR draft had split the charter into a data substrate axis and an editor-abstraction axis.

같은 날 사용자 정정으로 정체성 메모리가 박혔다.

> "repo 내부에서 editor 라는 네이밍을 쓰고 있는데 editor 용은 아니고 json tree 를 다루는거라고 생각해줘"

That vocabulary conflicts with the current identity. 또한 후속 `/discuss` + `/grill-me` 11라운드 (2026-05-10) 에서 정체성 한 줄이 더 정밀하게 박혔고, 이 한 줄에서 자동 파생되는 헌장 어휘가 이전 draft 의 어휘와 다르다.

> zod-crud = FE 서비스가 매번 다시 만드는 편집 어휘 (select / move / cut / copy / paste / duplicate / undo / redo / find / replace) 를 JSON 표준 (RFC 6901 / 6902 / 9535 / W3C Selection / RFC 8927+Zod) 과 매핑하여 재사용 가능한 표준 레이어로 정립한 JSON tree 라이브러리.

## Decision

이 ADR 은 이전 draft 의 **결정 내용은 보존하고, 어휘는 대체**한다.

### 보존되는 결정

- selection / focus 는 라이브러리 책임이다 (이전 SPEC §8 비-목표 선언 폐기 유지)
- 좌표는 RFC 6901 Pointer 위에서 정의된다
- 좌표 상태는 100% JSON 직렬화 가능하다
- WAI-ARIA 어휘와 정합한다
- RFC 6902 op 적용 시 자동 추적된다

### 새 어휘 (ADR-0001 supersede)

- **두 축 어휘 폐기**. data/editor 두 분류축으로 나누지 않는다.
- **에디터 추상화 어휘 폐기**. 라이브러리는 editor 가 아니라 JSON tree 다.
- **새 헌장 어휘 — 4대 기둥 + 10 verbs + hooks/commands/verbs/core**:
  - 4대 기둥 (verb 분류축): Selection / Edit / Clipboard / Undo
  - 10 verbs (closure 단위): select, move, cut, copy, paste, duplicate, undo, redo, find, replace
  - 코드 위계: hooks/ (React 어댑터) → commands/ (facade builders) → verbs/ (편집 어휘 composer, pure) → core/ (RFC 표준 substrate, pure) + sidecars/

### 4대 기둥 ↔ 10 verbs ↔ RFC 매핑 (closure 검증 표)

| 기둥 | verbs | RFC/표준 substrate |
|------|-------|---------------------|
| Selection (어디) | select, find | RFC 6901 + W3C Selection / RFC 9535 |
| Edit (뭐를) | move, duplicate, replace | RFC 6902 (move/copy/replace + 합성) |
| Clipboard (외부 round-trip) | cut, copy, paste | RFC 6902 (remove/add) + RFC 8259 fragment 직렬화 |
| Undo (되돌림) | undo, redo | RFC 6902 inverse + history stack |

= 2 + 3 + 3 + 2 = 10. 닫힘.

### Boundary

JSON 데이터 편집만 본체. 다음은 본체 밖이다.
- system clipboard 호출 (navigator.clipboard.read/write)
- DOM 이벤트 → verb 매핑 (Cmd+C 등)
- 시각적 selection rendering / ARIA 자동 부여
- 키보드 매핑

verb 는 payload 를 산출만 하고 system clipboard write 는 호출자 책임.

### Layer 규약

- `verbs/*` — 명시 인자만 받는 pure 함수. selection 자동 사용 금지.
- `hooks/useJsonDocument` — pure verb 호출 전 `state.selection` 자동 주입하는 sugar.
- `core/*` — RFC 1개 = 폴더 1개. 외부 의존은 `core/schema/` (Zod) 만 허용.
- `verbs/*` 끼리 import 금지 (lint rule). 합성은 facade 에서만.

### Schema 보호

`useJsonDocument({ schema, initial })` 에서 schema 는 **mandatory**. 모든 mutating verb 는 `core/schema/preFlight` gate 통과 (branch-only 검증).

## Consequences

### Positive

- 정체성 한 줄과 모든 surface (SPEC, ADR, memory, BACKLOG, 코드) 가 정합.
- closure 검증 도구 (4대 기둥 ↔ 10 verbs 표) 가 새 verb 후보 판정의 단일 기준.
- hooks/commands/verbs/core 위계가 코드 차원에서 substrate / wrapper 분리를 강제.
- "editor" 어휘 사용자 정정과 일관됨.

### Negative

- SPEC §0 전체 재작성 필요 (P0.1).
- 이전 draft 의 두 축 어휘를 인용한 후속 코드 / 주석 정정 필요 (P0, P7).
- 에디터 추상화라는 명료한 어휘 1개를 잃고 "편집 어휘 wrapper" + 4대 기둥 + 10 verbs + hooks/commands/verbs/core 라는 구조로 분해됨 — 한 줄 카피 비용 증가.

### Neutral

- 이전 draft 의 결정 내용은 본 ADR 에 흡수되어 보존.
- 코드 자체 변경 없음 (이 ADR 은 헌장 결정만). 코드 변경은 P0~P8 sub-issue 에서.

## SemVer 정책

본 ADR + 후속 P0~P8 8 phase 전체를 **v0.x minor** 로 진행. v0.1 → v0.7. v1.0 은 검증 누적 후 별도 ADR.

## RFC 9535 substrate

`core/jsonpath/` 는 외부 라이브러리 의존 없이 **자체 구현** (RFC 9535 conformance suite 통과 목표). 외부 라이브러리 선택 ADR 불필요.

## Migration

본 ADR 머지 후 sub-issue 진행:
- P0.1 SPEC §0 재작성 (#17)
- P0.2 STANDARDS.md 신설 (#18)
- P0.3 BACKLOG / README / GLOSSARY 어휘 정정 (#19)
- 이후 P1~P8

## References

- 정체성 한 줄 (memory): `project_zod_crud_identity_canonical.md`
- 4대 기둥 ↔ 10 verbs 매핑 표 (memory): `project_zod_crud_pillars_verbs_map.md`
- verbs layering 규약 (memory): `feedback_verbs_layering.md`
- RFC 9535 자체 구현 (memory): `project_zod_crud_rfc9535_self_impl.md`
- SemVer 정책 (memory): `project_zod_crud_semver.md`
- preFlight 검증 범위 (memory): `project_zod_crud_preflight_scope.md`
- Epic: #15
