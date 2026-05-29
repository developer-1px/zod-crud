# 문서 구조

이 디렉터리는 외부 사용자에게 공개할 문서 원천과 최소 표준 문서만 보관한다.
릴리스 과정, 검토 루프, 과거 판단 기록은 공개 사용자가 알아야 할 내용이
아니므로 별도 markdown으로 유지하지 않는다.

```txt
docs
|-- changelog.md              # 사용자 영향 중심 변경 기록
|-- generated
|   |-- repo-catalog.json      # package/app/lab scan 결과
|   `-- extensions-catalog.md  # site가 붙이는 extension catalog
|-- public
|   |-- overview.md            # 프로젝트 이해
|   |-- quickstart.md          # 사용 시작
|   |-- api.md                 # 공개 API
|   |-- extensions.md          # 공식 extension 사용법
|   `-- recipes.md             # 제품별 feature coverage 지도
`-- standard
    |-- core-standard.md        # 표준 후보 계약
    |-- extension-delegation-standard.md
    |-- foundation-gate.md      # foundation 판정 기준
    `-- zod-crud-spec.md        # 패키지 의미론 명세
```

## 책임 기준

| 위치 | 책임 | 독자 |
| --- | --- | --- |
| `changelog.md` | 사용자 영향 중심 변경 기록 | 외부 사용자, 릴리스 확인자 |
| `generated/` | repo scan으로 만든 reference data. 직접 편집하지 않는다. | 사이트, evaluator |
| `public/` | 사용법과 프로젝트 이해를 위한 공식 문서 원천 | 외부 사용자, LLM, 사이트 방문자 |
| `standard/` | 구현과 분리된 public API 의미론과 conformance 기준 | 표준화 검토자, 대체 구현 작성자 |

## 작성 원칙

- 본문은 한글로 쓴다.
- 코드 식별자, 명령어, 파일 경로, 표준명은 원문을 유지한다.
- public 문서는 usage와 프로젝트 이해만 다룬다.
- 릴리스 history, 검토 loop, maintainer-only gate는 public 문서에 쓰지 않는다.
- 내부 구현 경로는 public 문서에 쓰지 않는다.
- package/app/lab 목록은 `npm run docs:generate` 결과를 우선 사용한다.
- 새 문서는 기존 책임 폴더 중 하나에 들어가야 한다.
- 새 책임 폴더가 필요하면 먼저 이 파일의 책임 표를 갱신한다.
