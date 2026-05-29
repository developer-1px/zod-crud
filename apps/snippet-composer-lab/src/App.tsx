import { useMemo, useState } from "react";
import { createSnippets, type Snippet, type SnippetInsertOptions } from "@zod-crud/snippets";
import { useJSONDocument } from "zod-crud/react";
import type { JSONCapabilityResult, JSONDocumentPasteTarget, Pointer } from "zod-crud";
import { z } from "zod";
import "./snippet-composer-lab.css";

const BlockSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("text"),
    id: z.string().min(1),
    text: z.string().min(1),
  }),
  z.object({
    kind: z.literal("callout"),
    id: z.string().min(1),
    tone: z.enum(["info", "warn"]),
    text: z.string().min(1),
  }),
  z.object({
    kind: z.literal("cta"),
    id: z.string().min(1),
    label: z.string().min(1),
    href: z.string().url(),
  }),
]);

export const PageSchema = z.object({
  title: z.string().min(1),
  blocks: z.array(BlockSchema),
}).superRefine((page, ctx) => {
  const seen = new Set<string>();
  for (const [index, block] of page.blocks.entries()) {
    if (!seen.has(block.id)) {
      seen.add(block.id);
      continue;
    }
    ctx.addIssue({
      code: "custom",
      path: ["blocks", index, "id"],
      message: "duplicate block id",
    });
  }
});

export const initialPage: z.output<typeof PageSchema> = {
  title: "Launch page",
  blocks: [
    { kind: "text", id: "intro", text: "Draft the opening copy." },
    { kind: "callout", id: "note", tone: "info", text: "Keep the schema valid." },
  ],
};

const snippetCatalog = [
  {
    id: "text-block",
    label: "Text block",
    payload: { kind: "text", id: "intro", text: "Reusable paragraph." },
  },
  {
    id: "warning-callout",
    label: "Warning callout",
    payload: { kind: "callout", id: "note", tone: "warn", text: "Check this before publishing." },
  },
  {
    id: "cta-link",
    label: "CTA link",
    payload: { kind: "cta", id: "cta", label: "Read docs", href: "https://example.com/docs" },
  },
  {
    id: "broken-link",
    label: "Broken link",
    payload: { kind: "cta", id: "broken", label: "Broken", href: "not-a-url" },
  },
] satisfies ReadonlyArray<Snippet>;

type TargetMode = "append" | "after-selected" | "replace-selected";

export function App() {
  const doc = useJSONDocument(PageSchema, initialPage, { history: 50 });
  const snippets = useMemo(() => createSnippets(doc, snippetCatalog), [doc]);
  const [selectedSnippetId, setSelectedSnippetId] = useState("text-block");
  const [selectedBlockIndex, setSelectedBlockIndex] = useState(0);
  const [targetMode, setTargetMode] = useState<TargetMode>("append");
  const [rekey, setRekey] = useState(false);
  const [message, setMessage] = useState("ready");

  const blockIndex = Math.min(selectedBlockIndex, Math.max(doc.value.blocks.length - 1, 0));
  const target = targetFromMode(targetMode, blockIndex);
  const options = useMemo<SnippetInsertOptions | undefined>(() => (
    rekey
      ? { rekey: { fields: ["id"], strategy: "suffix" } }
      : undefined
  ), [rekey]);
  const plan = snippets.canInsert(selectedSnippetId, target, options);
  const canInsert = plan.ok;
  const summaries = snippets.list();

  const insertSelectedSnippet = () => {
    const result = snippets.insert(selectedSnippetId, target, options);
    if (!result.ok) {
      setMessage(`${result.code}: ${result.reason}`);
      return;
    }
    setMessage(`insert ${result.id}`);
  };

  return (
    <main className="snippet-composer-lab">
      <header className="snippet-composer-lab__bar">
        <h1>Snippet composer lab</h1>
        <div className="snippet-composer-lab__actions">
          <button type="button" onClick={() => doc.undo()} disabled={!doc.canUndo().ok}>undo</button>
          <button type="button" onClick={() => doc.redo()} disabled={!doc.canRedo().ok}>redo</button>
          <button type="button" onClick={() => { doc.reset(); setMessage("reset"); }}>reset</button>
        </div>
      </header>

      <div className="snippet-composer-lab__grid">
        <aside className="snippet-composer-lab__panel" aria-label="snippet command">
          <h2>Insert snippet</h2>
          <div className="snippet-composer-lab__snippets" aria-label="snippets">
            {summaries.map((snippet) => (
              <button
                key={snippet.id}
                type="button"
                className={selectedSnippetId === snippet.id ? "selected" : ""}
                onClick={() => setSelectedSnippetId(snippet.id)}
                aria-label={`select ${snippet.id}`}
              >
                {snippet.label ?? snippet.id}
              </button>
            ))}
          </div>

          <label>
            <span>target</span>
            <select
              value={targetMode}
              onChange={(event) => setTargetMode(event.currentTarget.value as TargetMode)}
              aria-label="target mode"
            >
              <option value="append">append</option>
              <option value="after-selected">after selected</option>
              <option value="replace-selected">replace selected</option>
            </select>
          </label>

          <label className="snippet-composer-lab__check">
            <input
              type="checkbox"
              checked={rekey}
              onChange={(event) => setRekey(event.currentTarget.checked)}
              aria-label="rekey ids"
            />
            rekey ids
          </label>

          <dl className="snippet-composer-lab__capability">
            <div>
              <dt>canInsert</dt>
              <dd aria-label="canInsert">{capabilityLabel(plan)}</dd>
            </div>
            <div>
              <dt>target</dt>
              <dd aria-label="target value">{targetLabel(target)}</dd>
            </div>
          </dl>

          <button type="button" onClick={insertSelectedSnippet} disabled={!canInsert}>insert</button>
        </aside>

        <section className="snippet-composer-lab__document" aria-label="page blocks">
          <h2>{doc.value.title}</h2>
          {doc.value.blocks.map((block, index) => (
            <button
              key={`${block.id}-${index}`}
              type="button"
              className={index === blockIndex ? "selected" : ""}
              onClick={() => setSelectedBlockIndex(index)}
              aria-label={`select block ${index}`}
            >
              <strong>{block.id}</strong>
              <span>{block.kind}</span>
              <BlockContent block={block} />
            </button>
          ))}
        </section>
      </div>

      <p className="snippet-composer-lab__status" role="status">{message}</p>
    </main>
  );
}

function BlockContent(props: { block: z.output<typeof BlockSchema> }) {
  const { block } = props;
  if (block.kind === "cta") return <span>{block.label} - {block.href}</span>;
  if (block.kind === "callout") return <span>{block.tone}: {block.text}</span>;
  return <span>{block.text}</span>;
}

function targetFromMode(mode: TargetMode, selectedIndex: number): JSONDocumentPasteTarget {
  if (mode === "after-selected") return { after: blockPointer(selectedIndex) };
  if (mode === "replace-selected") return { replace: blockPointer(selectedIndex) };
  return "/blocks/-";
}

function blockPointer(index: number): Pointer {
  return `/blocks/${index}` as Pointer;
}

function targetLabel(target: JSONDocumentPasteTarget): string {
  if (typeof target === "string") return target;
  if ("after" in target) return `after ${target.after}`;
  if ("before" in target) return `before ${target.before}`;
  if ("replace" in target) return `replace ${target.replace}`;
  return "target";
}

function capabilityLabel(plan: ReturnType<ReturnType<typeof createSnippets>["canInsert"]>): string {
  if (!plan.ok) {
    return plan.code === "disabled" && plan.capability !== undefined
      ? capabilityErrorLabel(plan.capability)
      : plan.code;
  }
  return "ok";
}

function capabilityErrorLabel(capability: Exclude<JSONCapabilityResult, { ok: true }>): string {
  if ("violations" in capability && capability.violations.length > 0) {
    return `${capability.code}: ${capability.violations[0]?.message ?? "schema"}`;
  }
  return capability.code;
}
