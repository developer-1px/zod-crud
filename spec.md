# zod-crud Showcase Rebuild Spec

이 문서는 현재 쇼케이스 구현을 버리고 다시 만들 때 맥락이 끊어지지 않도록 남기는 의도 문서다.
구현 상세, CSS 장식, 임시 컴포넌트 설계가 아니라 "무엇을 보여주려는 앱인가"와 "어떤 구성으로 다시 만들 것인가"만 기록한다.

## 핵심 의도

`zod-crud`가 핵심이다.

이 앱은 디자인 시스템 쇼케이스가 아니다. 사용자가 봐야 하는 것은 예쁜 패널이 아니라, Zod 스키마가 보장하는 JSON 문서를 `zod-crud`가 어떻게 읽고, 만들고, 수정하고, 삭제하고, 되돌리는지다.

앱은 다음 메시지를 즉시 전달해야 한다.

- Zod schema가 데이터의 허용 범위를 정의한다.
- `zod-crud`는 그 schema를 통과하는 변경만 commit한다.
- 문서는 flat node table로 다뤄지고, UI는 그 node table을 얇게 투영한다.
- Tree, table, form, preview는 모두 같은 validated document를 보고 있다.
- CRUD 조작은 UI state가 아니라 `zod-crud` operation의 결과로 설명되어야 한다.

## 버릴 것

현재 쇼케이스의 구현은 유지 대상이 아니다.

- 직접 만든 디자인 시스템처럼 보이는 카드, 그룹, 장식 패널
- Radix primitive를 조립해서 만든 커스텀 컨트롤 레이어
- 필요 이상으로 많은 CSS
- UI 설명을 위한 UI
- JSON viewer, clipboard viewer, timeline 등 핵심 설명을 흐리는 보조 장치
- 모바일 프리뷰를 감싸는 과한 데스크톱 장식
- input처럼 보이지 않는 커스텀 input

다시 만들 때 이전 구현에서 가져와도 되는 것은 데이터 의도뿐이다.

- 예시 Zod schema
- 예시 initial data
- `zod-crud` operation 흐름
- mobile preview가 보여주려는 도메인 형태

## 사용할 UI 방향

잘 만들어진 완성형 업무용 컴포넌트 컨트롤을 쓴다.

권장 선택은 Ant Design이다.

- `Tree`: Layers / node hierarchy
- `Table`: node table / operation result table
- `Form`: selected node / entity edit
- `Input`, `InputNumber`, `Select`, `Checkbox`, `DatePicker`: 실제 form control
- `Tabs`: Design / Data 등 주요 모드 전환
- `Layout` 또는 `Splitter`: 좌측 tree, 중앙 preview, 우측 form/table
- `Descriptions` 또는 compact `Form`: read-only metadata
- `ConfigProvider`: 최소 theme token 설정

CSS는 레이아웃 보정과 모바일 프리뷰 표현에만 쓴다.
컴포넌트의 기본 상태, focus, disabled, validation, spacing은 라이브러리에 맡긴다.

## 전체 구성

첫 화면은 앱이어야 한다. 랜딩 페이지나 소개 페이지를 만들지 않는다.

```txt
App
  TopBar
    Brand: zod-crud
    Mode tabs: Design / Data
    Commands: undo, redo, reset

  Design mode
    Left: Tree
      zod-crud JsonDoc nodes
      selected node sync
      click selects node

    Center: Mobile Preview
      실제 모바일 화면처럼 보여야 함
      데스크톱 디자인 캔버스 장식이 핵심이 아님
      selected node와 preview element가 연결됨

    Right: Inspector
      Form: selected node / binding / operation metadata
      Table: node table

  Data mode
    Entity schema
    UI data compiled from design/document intent
    Form bound to entity data
    Preview bound to the same entity data
```

## Design Mode 의도

Design mode는 "디자인 툴"이 아니라 `zod-crud` document explorer다.

사용자는 Tree에서 node를 고르고, 중앙 preview에서 같은 node가 어디에 나타나는지 보고, 우측에서 그 node의 schema/binding/operation 정보를 본다.

필수 동기화:

- Tree selection -> preview highlight
- Preview selection -> tree selection
- Node table row selection -> tree/preview selection
- CRUD operation -> schema validation -> valid commit only

필수 command:

- create
- update
- delete
- copy
- cut
- paste
- undo
- redo
- reset

명령 버튼은 가능할 때만 enabled 되어야 한다.
가능 여부는 UI 추측이 아니라 `zod-crud` 상태와 schema validation 결과에서 와야 한다.

## Data Mode 의도

Data mode는 "이 디자인이 실제 데이터와 어떻게 붙는가"를 보여준다.

목표는 다음 세 가지가 한 화면에서 연결되는 것이다.

- Entity schema: Zod가 허용하는 데이터 구조
- UI data: 어떤 UI block이 어떤 entity path를 읽고 쓰는지
- Form/Preview: 같은 data를 입력과 화면으로 동시에 표현

여기서도 핵심은 디자인이 아니다.
폼 입력이 바뀌면 `zod-crud` operation을 통해 entity document가 바뀌고, preview는 같은 document에서 다시 그려져야 한다.

## 모바일 프리뷰 원칙

모바일 디자인은 모바일 디자인 그대로 간다.

- 모바일 화면은 phone-sized surface로 보인다.
- desktop dashboard card 안에 갇힌 장식처럼 보이면 안 된다.
- 좁은 viewport에서는 mobile preview가 먼저 보여야 한다.
- input, select, list, action은 실제 앱 화면처럼 읽혀야 한다.
- preview는 예쁜 mockup보다 "schema-bound UI"라는 사실이 중요하다.

## Form 원칙

input은 input답게 보여야 한다.

- text value는 `Input`
- number value는 `InputNumber`
- enum은 `Select`
- boolean은 `Checkbox`
- long text는 `TextArea`
- read-only metadata도 가짜 badge/card보다 disabled/readOnly control이나 descriptions를 우선한다.

폼은 직접 만든 control shell을 쓰지 않는다.
라이브러리 form control을 그대로 사용하고, 필요한 mapping만 만든다.

## Tree / Table 원칙

Tree와 Table은 직접 만들지 않는다.

Tree는 `JsonDoc`을 다음 형태로 매핑한다.

```ts
type TreeNode = {
  key: NodeId;
  title: string;
  children?: TreeNode[];
};
```

Table은 `JsonDoc.nodes`를 rows로 매핑한다.

```ts
type NodeRow = {
  id: NodeId;
  type: JsonNode["type"];
  parentId: NodeId | null;
  key: string | number | null;
  children: number;
  value: string;
};
```

테이블은 진단용이다.
row click selection 정도만 있으면 충분하다.
필터, 정렬, pagination은 필요해질 때만 추가한다.

## 구현 경계

새 구현에서 남겨야 할 자체 코드:

- Zod schema 정의
- initial JSON data
- `createJsonCrud(...)` setup
- `JsonDoc -> TreeData` mapper
- `JsonDoc -> TableRows` mapper
- selected node 계산
- selected binding 계산
- command 가능 여부 계산
- command 실행과 focus recovery
- entity data form binding
- mobile preview rendering

새 구현에서 직접 만들지 않을 것:

- Button, Input, Select, Tree, Table, Form, Tabs
- spacing system
- card system
- focus ring
- disabled style
- validation control shell

## 성공 기준

다시 만든 앱은 다음 기준을 통과해야 한다.

- 첫 화면에서 `zod-crud`가 무엇을 하는지 흐름이 보인다.
- UI 라이브러리 컴포넌트가 대부분의 화면 골격을 맡는다.
- CSS는 크게 줄어 있고, 디자인 장식보다 레이아웃/프리뷰에 집중한다.
- Layers는 진짜 Tree다.
- 우측 패널은 Form과 Table 중심이다.
- Data mode는 schema, UI data, form, preview의 연결을 보여준다.
- 모바일 viewport에서 mobile preview가 뒤로 밀리지 않는다.
- 모든 mutation은 `zod-crud` operation을 통한다.
- typecheck, build, browser smoke test가 통과한다.

## 재작성 시작점

현재 구현을 고치는 방식보다 새로 쓰는 방식이 맞다.

권장 순서:

1. `apps/showcase`에서 UI 구현을 최소 파일 구조로 다시 만든다.
2. Ant Design을 설치하고 Radix 의존성을 제거한다.
3. Zod schema와 initial data만 먼저 둔다.
4. `createJsonCrud`로 document state를 만든다.
5. Tree, Table, Form을 library component로 연결한다.
6. 마지막에 mobile preview를 붙인다.
7. 필요한 CSS만 추가한다.

이 문서의 목적은 다음 작업자가 이전 UI 구현에 끌려가지 않게 하는 것이다.
이전 UI는 참고물이 아니라 폐기 대상이다.
