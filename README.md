# zod-crud

Zod schema로 검증되는 JSON document editing facade와 작은 extension 함수들을
모은 monorepo입니다. 앱 전체를 소유하지 않고, JSON document mutation,
selection, clipboard payload, history, persistence-adjacent workflow의 하부
구조를 제공합니다.

공식 사이트: https://developer-1px.github.io/zod-crud/

## 문서 지도

| 목적 | 위치 |
| --- | --- |
| 프로젝트 이해 | [docs/public/overview.md](docs/public/overview.md) |
| 빠른 사용 예제 | [docs/public/quickstart.md](docs/public/quickstart.md) |
| 공개 API | [docs/public/api.md](docs/public/api.md) |
| 공식 extension 사용법 | [docs/public/extensions.md](docs/public/extensions.md) |
| 문서 구조 | [docs/README.md](docs/README.md) |
| 변경 기록 | [docs/changelog.md](docs/changelog.md) |
| core 의미론 명세 | [docs/standard/zod-crud-spec.md](docs/standard/zod-crud-spec.md) |

## 코드 지도

| 위치 | 역할 |
| --- | --- |
| [packages/zod-crud](packages/zod-crud) | core package. `createJSONDocument`, JSON Patch/Pointer/Path, selection, clipboard, history |
| [packages/collection](packages/collection) | ordered JSON array item 이동/복제/삭제 |
| [packages/clipboard-web](packages/clipboard-web) | browser clipboard bridge |
| [packages/schema-form](packages/schema-form) | schema-backed field descriptor |
| [packages/dirty-state](packages/dirty-state) | clean baseline 대비 dirty state |
| [packages/bulk-edit](packages/bulk-edit) | JSONPath replace-all/delete-all |
| [packages/patch-log](packages/patch-log) | applied patch stream 기록/replay |
| [packages/persist-web](packages/persist-web) | browser storage-like persistence |
| [packages/outline](packages/outline) | document outline projection |
| [apps/site](apps/site) | public docs site와 workbench |
| [apps/outliner](apps/outliner) | outliner demo app |
| [apps/mobile-cms](apps/mobile-cms) | mobile CMS demo app |
| [labs/extensions](labs/extensions) | 아직 공식 package가 아닌 extension 실험 |

## 경계

zod-crud가 맡는 것:

- Zod schema로 검증되는 JSON document state
- JSON Pointer 주소, JSON Patch mutation, JSONPath search
- `can*` capability result
- headless selection, clipboard payload, undo/redo history
- 작은 extension 함수 조합

앱이 맡는 것:

- rendering, DOM focus, keyboard, drag/drop UI
- grid selection, TSV clipboard, formula engine
- product command 이름, layout, route, remote protocol

## 개발

```sh
npm install
npm run dev
```

자주 쓰는 확인:

```sh
npm run docs:evaluate
npm test -w zod-crud
npm run typecheck -w zod-crud
npm run build -w zod-crud
```
