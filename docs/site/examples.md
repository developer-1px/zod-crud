# 예제 읽기

예제는 “완성된 앱”이라기보다 API 사용법을 작게 보여주는 코드입니다. 처음에는 아래 순서로 읽으면 됩니다.

## 1. 첫 patch

::source{path="apps/site/src/examples/snippet-getting-started.ts" title="snippet-getting-started.ts" lines="1-28"}

React 없이 `applyPatch`를 사용하는 예제입니다. zod-crud의 가장 안쪽 모델을 보여줍니다.

읽을 때는 세 가지만 보면 됩니다.

- schema가 먼저 있습니다.
- state는 plain object입니다.
- patch는 RFC 6902 operation 배열입니다.

## 2. BasicCrud

::source{path="apps/site/src/examples/BasicCrud.tsx" title="BasicCrud.tsx" lines="1-35"}

React에서 `useJson`을 사용하는 가장 작은 예제입니다.

`json`은 화면에 보여줄 값이고, `ops`는 값을 바꾸는 작업입니다. input의 `onChange`에서 `ops.replace`를 호출하는 흐름만 이해하면 됩니다.

## 3. RejectedDrift

::source{path="apps/site/src/examples/RejectedDrift.tsx" title="RejectedDrift.tsx" lines="1-50"}

schema를 깨는 변경이 들어오면 어떻게 실패하는지 보여줍니다.

입문자에게 중요한 포인트는 이것입니다.

> 실패한 변경은 state를 바꾸지 않습니다.

실패를 화면에 보여주고 싶다면 `strict: false`와 `onError`를 함께 씁니다.

## 4. ClipboardArray

::source{path="apps/site/src/examples/ClipboardArray.tsx" title="ClipboardArray.tsx" lines="1-75"}

이 예제 이름에는 Clipboard가 들어 있지만, 현재 public API에 `useClipboard` hook은 없습니다. 예제는 복제와 이동을 JSON Patch operation으로 표현하는 법을 보여줍니다.

| UI에서 부르는 이름 | 실제 operation |
|--------------------|----------------|
| duplicate | `copy` |
| move | `move` |
| 여러 단계 변경 | `patch` |

이 구분이 중요합니다. UI 용어는 애플리케이션마다 달라도, 데이터 변경은 표준 operation으로 남습니다.

## 예제를 읽는 습관

예제를 볼 때 “컴포넌트 구조”보다 먼저 이 세 가지를 찾으면 이해가 빠릅니다.

1. schema는 무엇인가?
2. 어떤 Pointer를 쓰는가?
3. 어떤 operation을 호출하는가?

이 세 가지가 보이면 zod-crud 코드는 대부분 읽을 수 있습니다.
