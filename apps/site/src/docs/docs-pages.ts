// SSOT: docs/site/*.md를 Vite glob으로 자동 수집한다.
// navLabel/order만 슬러그별로 유지한다.

const rawDocs = import.meta.glob("../../../../docs/site/*.md", {
  eager: true,
  import: "default",
  query: "?raw",
}) as Record<string, string>;

const slugMeta = {
  "intro": { navLabel: "Overview", order: 101 },
  "getting-started": { navLabel: "Quick Start", order: 102 },
  "concepts": { navLabel: "useJSONDocument", order: 103 },
  "operations": { navLabel: "Editor State", order: 104 },
  "schema-safety": { navLabel: "Safety", order: 105 },
  "clipboard-history": { navLabel: "UI Recipes", order: 106 },
  "advanced": { navLabel: "Core & Design", order: 108 },
  "patterns": { navLabel: "Patterns", order: 110 },
  "why-not": { navLabel: "Why Not", order: 111 },
} as const;

export type DocsPageSlug = keyof typeof slugMeta;

export type DocsPage = {
  slug: DocsPageSlug;
  route: string;
  navLabel: string;
  order: number;
  markdown: string;
};

function slugFromPath(path: string): string {
  const file = path.split("/").at(-1) ?? path;
  return file.replace(/\.md$/i, "");
}

const collected: DocsPage[] = [];
for (const [path, markdown] of Object.entries(rawDocs)) {
  const slug = slugFromPath(path);
  if (slug === "README") continue;
  if (!(slug in slugMeta)) {
    throw new Error(`docs-pages: ${path} has no slugMeta entry. Add "${slug}" to slugMeta.`);
  }
  const meta = slugMeta[slug as DocsPageSlug];
  collected.push({
    slug: slug as DocsPageSlug,
    route: `/docs/${slug}`,
    navLabel: meta.navLabel,
    order: meta.order,
    markdown,
  });
}
collected.sort((a, b) => a.order - b.order);

// 빌드 타임 검증: 모든 ::source{path="..."}가 실제 파일을 가리키는가
import { parseMarkdown } from "./markdown.js";
import { resolveSourceReference } from "./source-references.js";
{
  const broken: string[] = [];
  for (const page of collected) {
    const blocks = parseMarkdown(page.markdown);
    for (const b of blocks) {
      if (b.kind !== "source") continue;
      try {
        resolveSourceReference(b.reference);
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown source reference error";
        broken.push(`${page.slug}.md → ${b.reference.path}:${b.reference.lines} — ${message}`);
      }
    }
  }
  if (broken.length > 0) {
    throw new Error(`docs ::source paths broken (${broken.length}):\n  ${broken.join("\n  ")}`);
  }
}

export const docsPages = collected;

export const docsPagesBySlug = Object.fromEntries(
  docsPages.map((page) => [page.slug, page]),
) as Record<DocsPageSlug, DocsPage>;
