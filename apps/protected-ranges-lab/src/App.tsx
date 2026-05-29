import { useMemo, useState } from "react";
import { createProtectedRanges, type ProtectedRange } from "@zod-crud/protected-ranges";
import { useJSONDocument } from "zod-crud/react";
import { z } from "zod";
import "./protected-ranges-lab.css";

const SectionSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  body: z.string().min(1),
});

export const PageSchema = z.object({
  title: z.string().min(1),
  slug: z.string().min(1),
  sections: z.array(SectionSchema),
});

export const initialPage: z.output<typeof PageSchema> = {
  title: "Release page",
  slug: "release-page",
  sections: [
    { id: "intro", title: "Intro", body: "Editable opening." },
    { id: "legal", title: "Legal", body: "Protected text." },
    { id: "cta", title: "CTA", body: "Editable action." },
  ],
};

const ranges: ReadonlyArray<ProtectedRange> = [
  { id: "published-slug", pointer: "/slug", label: "Published slug" },
  { id: "legal-section", pointer: "/sections/1", label: "Legal section" },
];

export function App() {
  const doc = useJSONDocument(PageSchema, initialPage, { history: 50 });
  const protectedRanges = useMemo(() => createProtectedRanges(doc, ranges), [doc]);
  const [message, setMessage] = useState("ready");

  const slugCapability = protectedRanges.canReplace("/slug", "next-slug");
  const titleCapability = protectedRanges.canReplace("/title", "Updated release page");
  const insertBeforeLegalCapability = protectedRanges.canInsert("/sections/1", {
    id: "before-legal",
    title: "Before legal",
    body: "Would reindex the protected section.",
  });
  const appendCapability = protectedRanges.canInsert("/sections/-", {
    id: "tail",
    title: "Tail",
    body: "Safe append.",
  });

  const setTitle = () => {
    const result = protectedRanges.replace("/title", "Updated release page");
    setMessage(result.ok ? "replace title" : `${result.code}: /title`);
  };

  const setSlug = () => {
    const result = protectedRanges.replace("/slug", "next-slug");
    setMessage(result.ok ? "replace slug" : `${result.code}: /slug`);
  };

  const insertBeforeLegal = () => {
    const result = protectedRanges.insert("/sections/1", {
      id: "before-legal",
      title: "Before legal",
      body: "Would reindex the protected section.",
    });
    setMessage(result.ok ? "insert before legal" : `${result.code}: /sections/1`);
  };

  const appendSection = () => {
    const result = protectedRanges.insert("/sections/-", {
      id: `tail-${doc.value.sections.length}`,
      title: "Tail",
      body: "Safe append.",
    });
    setMessage(result.ok ? "append section" : `${result.code}: /sections/-`);
  };

  return (
    <main className="protected-ranges-lab">
      <header className="protected-ranges-lab__bar">
        <h1>Protected ranges lab</h1>
        <div className="protected-ranges-lab__actions">
          <button type="button" onClick={() => doc.undo()} disabled={!doc.canUndo().ok}>undo</button>
          <button type="button" onClick={() => doc.redo()} disabled={!doc.canRedo().ok}>redo</button>
          <button type="button" onClick={() => { doc.reset(); setMessage("reset"); }}>reset</button>
        </div>
      </header>

      <div className="protected-ranges-lab__grid">
        <aside className="protected-ranges-lab__panel" aria-label="protected commands">
          <h2>Commands</h2>
          <CommandButton label="replace title" capability={titleCapability} onClick={setTitle} />
          <CommandButton label="replace slug" capability={slugCapability} onClick={setSlug} />
          <CommandButton label="insert before legal" capability={insertBeforeLegalCapability} onClick={insertBeforeLegal} />
          <CommandButton label="append section" capability={appendCapability} onClick={appendSection} />

          <dl className="protected-ranges-lab__ranges" aria-label="protected ranges">
            {protectedRanges.list().map((range) => (
              <div key={range.id}>
                <dt>{range.label ?? range.id}</dt>
                <dd>{range.pointer}</dd>
              </div>
            ))}
          </dl>
        </aside>

        <section className="protected-ranges-lab__document" aria-label="page document">
          <div>
            <span>title</span>
            <strong>{doc.value.title}</strong>
          </div>
          <div>
            <span>slug</span>
            <strong>{doc.value.slug}</strong>
          </div>
          {doc.value.sections.map((section, index) => (
            <article key={`${section.id}-${index}`} className={index === 1 ? "protected" : ""}>
              <span>{section.id}</span>
              <strong>{section.title}</strong>
              <p>{section.body}</p>
            </article>
          ))}
        </section>
      </div>

      <p className="protected-ranges-lab__status" role="status">{message}</p>
    </main>
  );
}

function CommandButton(props: {
  label: string;
  capability: { ok: boolean; code?: string };
  onClick(): void;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={!props.capability.ok}
      aria-label={props.label}
    >
      <span>{props.label}</span>
      <code>{props.capability.ok ? "ok" : props.capability.code}</code>
    </button>
  );
}
