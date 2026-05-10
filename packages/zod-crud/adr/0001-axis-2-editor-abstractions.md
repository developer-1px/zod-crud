# ADR 0001 — Axis 2: Editor abstractions on the RFC core

**Status**: Accepted (2026-05-10)
**Supersedes**: SPEC.md §8 (이전 버전 — selection/focus 비-목표 선언)
**Superseded by**: —

## Context

SPEC v1.0.0 의 §8 비-목표는 selection model · focus management 를 라이브러리 책임 밖으로 선언했다. 근거는 "JSON tree 라이브러리는 데이터만 다루고, UI state 는 사용자 layer" 라는 분리. 그러나 이는 두 가지 사실을 잘못 합쳤다.

1. 옛 NodeId 기반 구현 (`select.ts`, `focus.ts`) 은 **구현 자체가 폐기 대상이었지** 의미가 폐기 대상은 아니었다.
2. selection · focus 는 **모두 RFC 6901 Pointer 위에서 100% JSON 직렬화로 표현 가능**하다. SPEC §0.1 의 5대 원칙을 위반하지 않는다.

사용자 정정 (2026-05-10): "RFC 코어 위에서 editor 에서 쓰이는 모든 추상화를 제공하려는거잖아. 이 또한 변하지 않을 축이라고."

## Decision

라이브러리 헌장을 두 개의 30년 축으로 재편한다.

- **Axis 1 — Data substrate**: RFC 6901 + RFC 6902 + JSON. SPEC §0.1 (1)~(5).
- **Axis 2 — Editor abstractions**: Selection · Focus. Pointer 위에서 정의. SPEC §0.2 (6)~(10).

두 축은 동등 위계의 30년 락인이다. 한 축의 변경은 SemVer major.

## Consequences

### Positive

- 옛 자산의 **의미** 가 부활함 (selection set, focus filter). 사용자는 매번 재구현하지 않음.
- 두 축 모두 표준 어휘 (RFC 6901·6902·WAI-ARIA Listbox/Tree/Grid) 위에 있으므로 30년 호환.
- selection/focus 도 100% JSON 직렬화 → collaborative cursor·SSR·postMessage 무료.
- RFC 6902 op 적용 시 selection/focus 자동 추적 → 사용자 wiring 0.

### Negative

- SPEC §0.1 (5) "React 의존 = hook 1개" 는 정정 필요. 정정 후: "코어 데이터 hook = 1개. Axis 2 hook 들은 별도 sibling".
- `applyOperation`/`applyPatch` 시그니처에 `applied: JsonPatchOperation[]` 추가. semver minor (반환값 확장은 호환).
- Axis 2 hook 2 개 신설로 패키지 src 파일 수 증가.

### Neutral

- 옛 코드는 그대로 폐기 유지. 부활은 의미만, 구현은 RFC 6901 Pointer 위에 새로 짠다.

## ARIA 어휘 매핑

라이브러리 어휘 → ARIA 어휘:

| 라이브러리 | ARIA |
|------------|------|
| `useSelection` mode `"single"` | `aria-multiselectable="false"` |
| `useSelection` mode `"multiple"` / `"extended"` | `aria-multiselectable="true"` |
| `selection.has(p)` | `aria-selected="true"` per item |
| `selection.anchor` / `selection.focus` | DOM Selection API anchor/focus 패턴 + ARIA Listbox `aria-activedescendant` |
| `useFocus` value | `aria-activedescendant` 의 타겟 |

ARIA 패턴 자체는 W3C WAI-ARIA Authoring Practices (APG) 의 Listbox · Tree · Grid · TreeGrid 패턴을 참조. 라이브러리는 어휘만 차용하고 키보드 매핑·렌더링은 사용자 책임.

## Migration

이 결정은 v0.1 → v0.2 minor bump.

- `applyOperation`/`applyPatch` 의 반환 타입에 `applied: JsonPatchOperation[]` 추가 — 기존 사용자 코드는 호환 (반환값 확장).
- 신규 hook 2 개 추가 — 기존 사용자에게 영향 0.
- SPEC §8 정정 + §8.5 신설.
