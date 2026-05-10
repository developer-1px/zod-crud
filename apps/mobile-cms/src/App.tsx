import { useMemo, useState } from "react";
import { z } from "zod";

type AtomKind = "text" | "button" | "image";
type MoleculeKind = "mediaCard" | "ctaRow";
type OrganismKind = "hero" | "productGrid" | "articleList";
type BlockKind = AtomKind | MoleculeKind | OrganismKind;
type SectionKind = "heroSection" | "contentSection" | "commerceSection";
type NodeKind = "page" | "section" | BlockKind;

interface BaseNode {
  id: string;
  kind: NodeKind;
  name: string;
}

interface PageNode extends BaseNode {
  kind: "page";
  children: SectionNode[];
}

interface SectionNode extends BaseNode {
  kind: "section";
  sectionKind: SectionKind;
  children: BlockNode[];
}

interface BlockNode extends BaseNode {
  kind: BlockKind;
  props: Record<string, string>;
  children?: BlockNode[] | undefined;
}

type CmsNode = PageNode | SectionNode | BlockNode;
type Clipboard = { node: CmsNode; sourceId: string } | null;

const BlockSchema: z.ZodType<BlockNode> = z.lazy(() =>
  z.object({
    id: z.string(),
    kind: z.enum(["text", "button", "image", "mediaCard", "ctaRow", "hero", "productGrid", "articleList"]),
    name: z.string().min(1),
    props: z.record(z.string(), z.string()),
    children: z.array(BlockSchema).optional(),
  }),
);

const SectionSchema: z.ZodType<SectionNode> = z.object({
  id: z.string(),
  kind: z.literal("section"),
  sectionKind: z.enum(["heroSection", "contentSection", "commerceSection"]),
  name: z.string().min(1),
  children: z.array(BlockSchema),
});

const PageSchema: z.ZodType<PageNode> = z.object({
  id: z.string(),
  kind: z.literal("page"),
  name: z.string().min(1),
  children: z.array(SectionSchema),
});

const sectionAllows: Record<SectionKind, BlockKind[]> = {
  heroSection: ["hero", "mediaCard", "ctaRow"],
  contentSection: ["text", "image", "mediaCard", "articleList", "ctaRow"],
  commerceSection: ["productGrid", "mediaCard", "button", "ctaRow"],
};

const blockAllows: Partial<Record<BlockKind, BlockKind[]>> = {
  hero: ["text", "button", "image"],
  mediaCard: ["image", "text", "button"],
  ctaRow: ["button", "text"],
  productGrid: ["mediaCard"],
  articleList: ["text", "mediaCard"],
};

const palette: BlockNode[] = [
  block("hero", "Hero", { title: "Spring launch", body: "A page section built from safe blocks." }, [
    block("text", "Headline", { text: "Spring launch" }),
    block("button", "Primary action", { label: "Shop now" }),
  ]),
  block("mediaCard", "Media card", { title: "Lookbook", body: "Image, title, and action." }, [
    block("image", "Image", { alt: "Product image", src: "gradient" }),
    block("text", "Caption", { text: "New season essentials" }),
  ]),
  block("ctaRow", "CTA row", { label: "Join the list" }, [
    block("button", "CTA button", { label: "Subscribe" }),
  ]),
  block("productGrid", "Product grid", { title: "Featured products" }, [
    block("mediaCard", "Product card", { title: "Everyday tote", body: "$48" }),
  ]),
  block("articleList", "Article list", { title: "Guides" }, [
    block("text", "Guide title", { text: "How to style the capsule" }),
  ]),
  block("text", "Text", { text: "Reusable text atom" }),
  block("button", "Button", { label: "Learn more" }),
  block("image", "Image", { alt: "Decorative image", src: "gradient" }),
];

const initialPage: PageNode = {
  id: "page",
  kind: "page",
  name: "Mobile landing page",
  children: [
    {
      id: "section-hero",
      kind: "section",
      sectionKind: "heroSection",
      name: "Launch hero",
      children: [
        block("hero", "Hero story", { title: "Designed blocks, safe content", body: "Build a mobile page by composing schema-approved parts." }, [
          block("text", "Eyebrow", { text: "Mobile CMS" }),
          block("button", "Hero action", { label: "Preview page" }),
        ]),
      ],
    },
    {
      id: "section-content",
      kind: "section",
      sectionKind: "contentSection",
      name: "Editorial content",
      children: [
        block("mediaCard", "Editorial card", { title: "Content block", body: "Copy this into content or commerce, but not inside text." }),
      ],
    },
    {
      id: "section-commerce",
      kind: "section",
      sectionKind: "commerceSection",
      name: "Shop area",
      children: [
        block("productGrid", "Product grid", { title: "Shop the edit" }, [
          block("mediaCard", "Product card", { title: "Canvas bag", body: "$48" }),
        ]),
      ],
    },
  ],
};

function block(kind: BlockKind, name: string, props: Record<string, string>, children?: BlockNode[]): BlockNode {
  return children ? { id: makeId(kind), kind, name, props, children } : { id: makeId(kind), kind, name, props };
}

function makeId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

function cloneNode<T extends CmsNode>(node: T): T {
  const cloned = structuredClone(node) as T;
  const refresh = (current: CmsNode) => {
    current.id = makeId(current.kind);
    if ("children" in current && current.children) current.children.forEach(refresh);
  };
  refresh(cloned);
  return cloned;
}

function findNode(root: PageNode, id: string): CmsNode | null {
  if (root.id === id) return root;
  for (const section of root.children) {
    if (section.id === id) return section;
    for (const found of walkBlocks(section.children)) if (found.id === id) return found;
  }
  return null;
}

function* walkBlocks(nodes: BlockNode[]): Generator<BlockNode> {
  for (const node of nodes) {
    yield node;
    if (node.children) yield* walkBlocks(node.children);
  }
}

function canAccept(target: CmsNode, incoming: CmsNode) {
  if (incoming.kind === "page" || incoming.kind === "section") return { ok: false, reason: "Only design blocks can be pasted into the page." };
  if (target.kind === "page") return { ok: false, reason: "Paste blocks into a section, not directly into the page." };
  if (target.kind === "section") {
    const allowed = sectionAllows[target.sectionKind];
    return allowed.includes(incoming.kind) ? { ok: true } : { ok: false, reason: `${label(incoming.kind)} is not allowed in ${target.name}.` };
  }
  const allowed = blockAllows[target.kind] ?? [];
  return allowed.includes(incoming.kind) ? { ok: true } : { ok: false, reason: `${label(target.kind)} cannot contain ${label(incoming.kind)}.` };
}

function insertInto(root: PageNode, targetId: string, incoming: BlockNode): PageNode {
  const next = structuredClone(root) as PageNode;
  const target = findNode(next, targetId);
  if (!target || target.kind === "page") return next;
  if (target.kind === "section") target.children.push(incoming);
  else target.children = [...(target.children ?? []), incoming];
  return PageSchema.parse(next);
}

function updateProps(root: PageNode, nodeId: string, props: Record<string, string>): PageNode {
  const next = structuredClone(root) as PageNode;
  const node = findNode(next, nodeId);
  if (node && node.kind !== "page" && node.kind !== "section") node.props = props;
  return PageSchema.parse(next);
}

function label(kind: string) {
  return kind.replace(/[A-Z]/g, (m) => ` ${m.toLowerCase()}`);
}

export function App() {
  const [page, setPage] = useState<PageNode>(initialPage);
  const [selectedId, setSelectedId] = useState("section-hero");
  const [clipboard, setClipboard] = useState<Clipboard>(null);
  const [message, setMessage] = useState("Copy a block, then paste into a highlighted slot.");
  const selected = useMemo(() => findNode(page, selectedId), [page, selectedId]);

  const copy = (node: CmsNode) => {
    setClipboard({ node: cloneNode(node), sourceId: node.id });
    setMessage(`Copied ${node.name}. Valid drop targets are now highlighted.`);
  };

  const pasteInto = (target: CmsNode) => {
    if (!clipboard) {
      setMessage("Clipboard is empty. Copy a design block first.");
      return;
    }
    const verdict = canAccept(target, clipboard.node);
    if (!verdict.ok) {
      setMessage(verdict.reason ?? "This block is not allowed here.");
      return;
    }
    setPage((current) => insertInto(current, target.id, cloneNode(clipboard.node as BlockNode)));
    setSelectedId(target.id);
    setMessage(`Pasted ${clipboard.node.name} into ${target.name}.`);
  };

  const updateSelectedProps = (props: Record<string, string>) => {
    if (!selected || selected.kind === "page" || selected.kind === "section") return;
    setPage((current) => updateProps(current, selected.id, props));
  };

  return (
    <main className="app-shell">
      <aside className="panel palette-panel">
        <div className="panel-heading">
          <p className="eyebrow">Design system</p>
          <h1>Mobile CMS</h1>
        </div>
        <div className="palette-list">
          {palette.map((item) => (
            <button key={item.id} className="palette-item" onClick={() => copy(item)}>
              <span>{item.name}</span>
              <small>{label(item.kind)}</small>
            </button>
          ))}
        </div>
      </aside>

      <section className="phone-zone">
        <div className="topbar">
          <div>
            <strong>{page.name}</strong>
            <span>{message}</span>
          </div>
          <button onClick={() => setPage(initialPage)}>Reset</button>
        </div>
        <div className="phone-frame" aria-label="Mobile page preview">
          <div className="phone-screen">
            {page.children.map((section) => (
              <SectionView
                key={section.id}
                section={section}
                selectedId={selectedId}
                clipboard={clipboard}
                onSelect={setSelectedId}
                onCopy={copy}
                onPaste={pasteInto}
              />
            ))}
          </div>
        </div>
      </section>

      <aside className="panel inspector-panel">
        <div className="panel-heading">
          <p className="eyebrow">Inspector</p>
          <h2>{selected?.name ?? "Nothing selected"}</h2>
        </div>
        {selected && (
          <>
            <div className="meta-grid">
              <span>Kind</span><strong>{label(selected.kind)}</strong>
              {"sectionKind" in selected && <><span>Slot</span><strong>{label(selected.sectionKind)}</strong></>}
              <span>Clipboard</span><strong>{clipboard ? label(clipboard.node.kind) : "empty"}</strong>
            </div>
            <div className="action-row">
              <button onClick={() => copy(selected)} disabled={selected.kind === "page"}>Copy</button>
              <button onClick={() => pasteInto(selected)}>Paste into</button>
            </div>
            {selected.kind !== "page" && selected.kind !== "section" && (
              <PropEditor node={selected} onChange={updateSelectedProps} />
            )}
            <AllowedList selected={selected} clipboard={clipboard} />
          </>
        )}
      </aside>
    </main>
  );
}

function SectionView(props: {
  section: SectionNode;
  selectedId: string;
  clipboard: Clipboard;
  onSelect: (id: string) => void;
  onCopy: (node: CmsNode) => void;
  onPaste: (node: CmsNode) => void;
}) {
  const verdict = props.clipboard ? canAccept(props.section, props.clipboard.node) : null;
  return (
    <section
      className={`page-section ${props.section.id === props.selectedId ? "selected" : ""} ${verdict?.ok ? "accepts" : verdict ? "rejects" : ""}`}
      onClick={(e) => { e.stopPropagation(); props.onSelect(props.section.id); }}
    >
      <div className="section-label">
        <span>{props.section.name}</span>
        <button onClick={(e) => { e.stopPropagation(); props.onPaste(props.section); }}>Paste</button>
      </div>
      {props.section.children.map((child) => (
        <BlockView
          key={child.id}
          node={child}
          selectedId={props.selectedId}
          clipboard={props.clipboard}
          onSelect={props.onSelect}
          onCopy={props.onCopy}
          onPaste={props.onPaste}
        />
      ))}
    </section>
  );
}

function BlockView(props: {
  node: BlockNode;
  selectedId: string;
  clipboard: Clipboard;
  onSelect: (id: string) => void;
  onCopy: (node: CmsNode) => void;
  onPaste: (node: CmsNode) => void;
}) {
  const { node } = props;
  const verdict = props.clipboard ? canAccept(node, props.clipboard.node) : null;
  return (
    <article
      className={`block block-${node.kind} ${node.id === props.selectedId ? "selected" : ""} ${verdict?.ok ? "accepts" : verdict ? "rejects" : ""}`}
      onClick={(e) => { e.stopPropagation(); props.onSelect(node.id); }}
    >
      <div className="block-toolbar">
        <span>{node.name}</span>
        <div>
          <button onClick={(e) => { e.stopPropagation(); props.onCopy(node); }}>Copy</button>
          <button onClick={(e) => { e.stopPropagation(); props.onPaste(node); }}>Paste</button>
        </div>
      </div>
      <BlockContent node={node} />
      {node.children && node.children.length > 0 && (
        <div className="child-slot">
          {node.children.map((child) => (
            <BlockView
              key={child.id}
              node={child}
              selectedId={props.selectedId}
              clipboard={props.clipboard}
              onSelect={props.onSelect}
              onCopy={props.onCopy}
              onPaste={props.onPaste}
            />
          ))}
        </div>
      )}
    </article>
  );
}

function BlockContent({ node }: { node: BlockNode }) {
  if (node.kind === "hero") return <div className="hero-copy"><h2>{node.props.title}</h2><p>{node.props.body}</p></div>;
  if (node.kind === "mediaCard") return <div className="media-card"><div className="thumb" /><strong>{node.props.title}</strong><p>{node.props.body}</p></div>;
  if (node.kind === "ctaRow") return <div className="cta-row"><span>{node.props.label}</span></div>;
  if (node.kind === "productGrid") return <div className="grid-title">{node.props.title}</div>;
  if (node.kind === "articleList") return <div className="article-title">{node.props.title}</div>;
  if (node.kind === "button") return <button className="preview-button">{node.props.label}</button>;
  if (node.kind === "image") return <div className="image-block" aria-label={node.props.alt} />;
  return <p className="text-block">{node.props.text}</p>;
}

function PropEditor({ node, onChange }: { node: BlockNode; onChange: (props: Record<string, string>) => void }) {
  return (
    <div className="prop-editor">
      <h3>Content</h3>
      {Object.entries(node.props).map(([key, value]) => (
        <label key={key}>
          <span>{label(key)}</span>
          <input value={value} onChange={(e) => onChange({ ...node.props, [key]: e.target.value })} />
        </label>
      ))}
    </div>
  );
}

function AllowedList({ selected, clipboard }: { selected: CmsNode; clipboard: Clipboard }) {
  const allowed = selected.kind === "section" ? sectionAllows[selected.sectionKind] : selected.kind === "page" ? [] : blockAllows[selected.kind] ?? [];
  const verdict = clipboard ? canAccept(selected, clipboard.node) : null;
  return (
    <div className="rules-card">
      <h3>Schema slot</h3>
      <p>{allowed.length > 0 ? `Accepts ${allowed.map(label).join(", ")}.` : "This part does not accept children."}</p>
      {clipboard && <strong className={verdict?.ok ? "ok" : "no"}>{verdict?.ok ? "Clipboard can be pasted here." : verdict?.reason}</strong>}
    </div>
  );
}
