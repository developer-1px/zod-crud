# API 사용 gap 기록

이 문서는 외부 consumer와 adapter spike에서 나온 요구를 1.0 root 계약의
blocker인지, 1.0 이후 adapter/extension 작업인지 분류한다.

## 1.0 릴리스 분류

zod-crud 1.0 패키지 릴리스를 막는 미해결 외부 사용 gap은 없다.

잠긴 1.0 package 계약은 root `zod-crud` entrypoint와 `zod-crud/react`이며,
목록은 `packages/zod-crud/public-contract.json`에 있다.

## 현재 공개 표면

1.0 root 계약은 의도적으로 잠겨 있다.

- Root: `zod-crud`
- React: `zod-crud/react`
- 내부 source path import는 공개 계약이 아니다.
- `doc.ops`, `doc.commands`, `doc.check`, `doc.can` namespace는 프로덕션
  root 계약이 아니다.
- 필요한 consumer는 `doc.patch`, `doc.commit`, `doc.history`, `doc.clipboard`,
  `doc.can*` 위에 local adapter를 만든다.

## Gap 기록

| ID | 주제 | 1.0 판정 | 후속 책임 |
| --- | --- | --- | --- |
| G-001 | `doc.ops` facade drift | 1.0 root 계약에서는 닫힘 | 외부 adapter/migration |
| G-002 | `doc.commands` facade drift | 1.0 root 계약에서는 닫힘 | 외부 adapter/migration |
| G-003 | legacy `createJsonCrud` graph API | 1.0 blocker 아님 | migration guide 후보 |
| G-004 | path/selector subscription | 1.0 blocker 아님 | extension 후보 |
| G-005 | validation projection | core schema/read surface로 표현 가능 | adapter recipe |
| G-006 | scoped/entity history | core history가 아니라 extension 후보 | storage/collaboration package |
| G-007 | browser/system clipboard representation | core clipboard 밖 adapter 책임 | UI adapter |
| G-008 | pointer read ergonomics | `doc.at`, `doc.entries`, `doc.query`로 충분 | recipe |
| G-009 | selection adapter boundary | core는 headless selection만 소유 | UI adapter |
| G-010 | 공개 support type export 누락 | 프로덕션 root 계약에서는 닫힘 | 없음 |
| G-011 | commit prediction / mutation result state | `commit`, `lastPatch`, result로 표현 가능 | recipe |
| G-012 | rich text projection / editable slot adapter | extension 후보 | editor bridge |
| G-013 | patch sink / fire-and-forget ops type | core concept 아님 | app command adapter |

## 주요 결정

### G-001: `doc.ops` facade drift

상태: zod-crud 1.0 root 계약에서는 닫힘.

`doc.ops`는 편의 namespace다. 프로덕션 root 계약에는 넣지 않는다.
필요한 앱은 local adapter에서 다음처럼 감싼다.

```ts
const ops = {
  replaceTitle(title: string) {
    return doc.patch({ op: "replace", path: "/title", value: title });
  },
};
```

릴리스 결정:

- 프로덕션 root 계약에서 `doc.ops`를 제외한다.
- current active consumer가 이 이름을 필요로 하면 local adapter를 사용한다.

### G-002: `doc.commands` facade drift

상태: zod-crud 1.0 root 계약에서는 닫힘.

`doc.commands`는 product command vocabulary다. zod-crud core는 command registry,
keyboard policy, command palette를 소유하지 않는다.

릴리스 결정:

- 프로덕션 root 계약에서 `doc.commands`를 제외한다.
- command 이름은 앱이나 adapter가 정한다.

### G-010: 공개 support type export 누락

상태: 프로덕션 root 계약에서는 닫힘.

공개 `JSONDocument` surface에서 보이는 support type은 root export에 포함한다.
누락 여부는 `packages/zod-crud/public-contract.json`, package smoke, docs
consistency, `docs:evaluate`가 함께 검증한다.

## 1.0 이후 후보

다음은 package release blocker가 아니라 extension package 또는 adapter recipe
후보다.

- path/selector subscription
- scoped/entity history
- browser/system clipboard bridge
- rich text/editor bridge
- storage/collaboration bridge
- command palette adapter

## 즉시 권장 사항

1. `doc.ops`와 `doc.commands`를 프로덕션 root 계약에 추가하지 않는다.
2. 외부 consumer migration은 local adapter로 처리한다.
3. 새 core concept 요청은 기존 concept으로 표현해 본 뒤 실패 증거가 있을 때만
   표준화 검토에 올린다.
