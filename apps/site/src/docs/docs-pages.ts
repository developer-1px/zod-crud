import advancedMd from "../../../../docs/site/advanced.md?raw";
import clipboardHistoryMd from "../../../../docs/site/clipboard-history.md?raw";
import conceptsMd from "../../../../docs/site/concepts.md?raw";
import examplesMd from "../../../../docs/site/examples.md?raw";
import gettingStartedMd from "../../../../docs/site/getting-started.md?raw";
import introMd from "../../../../docs/site/intro.md?raw";
import operationsMd from "../../../../docs/site/operations.md?raw";
import schemaSafetyMd from "../../../../docs/site/schema-safety.md?raw";

export type DocsPageSlug =
  | "intro"
  | "getting-started"
  | "concepts"
  | "schema-safety"
  | "operations"
  | "clipboard-history"
  | "examples"
  | "advanced";

export type DocsPage = {
  slug: DocsPageSlug;
  route: string;
  navLabel: string;
  order: number;
  markdown: string;
};

export const docsPages = [
  {
    slug: "intro",
    route: "/docs/intro",
    navLabel: "zod-crud 소개",
    order: 1,
    markdown: introMd,
  },
  {
    slug: "getting-started",
    route: "/docs/getting-started",
    navLabel: "시작하기",
    order: 2,
    markdown: gettingStartedMd,
  },
  {
    slug: "concepts",
    route: "/docs/concepts",
    navLabel: "핵심 개념",
    order: 3,
    markdown: conceptsMd,
  },
  {
    slug: "schema-safety",
    route: "/docs/schema-safety",
    navLabel: "스키마 안전성",
    order: 4,
    markdown: schemaSafetyMd,
  },
  {
    slug: "operations",
    route: "/docs/operations",
    navLabel: "작업 모델",
    order: 5,
    markdown: operationsMd,
  },
  {
    slug: "clipboard-history",
    route: "/docs/clipboard-history",
    navLabel: "클립보드와 히스토리",
    order: 6,
    markdown: clipboardHistoryMd,
  },
  {
    slug: "examples",
    route: "/docs/examples",
    navLabel: "예제 읽기",
    order: 7,
    markdown: examplesMd,
  },
  {
    slug: "advanced",
    route: "/docs/advanced",
    navLabel: "고급 옵션",
    order: 8,
    markdown: advancedMd,
  },
] as const satisfies readonly DocsPage[];

export const docsPagesBySlug = Object.fromEntries(
  docsPages.map((page) => [page.slug, page]),
) as Record<DocsPageSlug, DocsPage>;
