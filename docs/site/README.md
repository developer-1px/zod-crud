# 사이트 문서 작성 규칙

이 디렉터리는 공식 사이트의 Markdown 문서 원본입니다.

본문 설명은 Markdown으로 작성합니다. 단, 저장소 안에 이미 존재하는 TypeScript 예제나 라이브러리 소스는 문서에 복사하지 않습니다. 실제 파일의 line range를 source-of-truth로 렌더링합니다.

```md
::source{path="packages/zod-crud/src/index.ts" lines="1-26"}
```

지원 속성:

- `path`: 저장소 기준 source path. 현재 사이트 렌더러는 `packages/zod-crud/src`, `apps/site/src/examples`, `apps/site/src/routes`의 TypeScript 파일을 등록합니다.
- `lines`: 한 줄 또는 inclusive `start-end` 범위.
- `title`: 선택적 탭 라벨.
- `height`: 선택적 viewer 높이. px 단위 숫자입니다. 기본값은 고정 높이 없음이며, line range 전체를 페이지에 펼쳐서 보여줍니다.

렌더러는 헤더를 `path:line-line` 형식으로 보여주고, viewer 안의 line number도 원본 파일 line number에서 시작합니다.

사이트 빌드는 모든 `::source` 지시문을 실제 resolver로 통과시킵니다. 존재하지 않는 path,
깨진 line range, 지원하지 않는 source root는 `npm run build -w @zod-crud/site`에서 실패해야 합니다.
