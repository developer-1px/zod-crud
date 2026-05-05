const apiGroups = [
  {
    title: "Commit subscription",
    detail: "Use with useSyncExternalStore, @p/headless/store, or any external cache.",
    code: `const unsubscribe = crud.subscribe(() => {
  const next = crud.snapshot()
})`,
  },
  {
    title: "Domain focus candidates",
    detail: "Skip structural JSON nodes such as children arrays when computing OperationResult.focusNodeId.",
    code: `const crud = createJsonCrud(schema, initial, {
  focusFilter: (doc, id) => doc.nodes[id]?.type === "object",
})`,
  },
  {
    title: "Semantic insertion",
    detail: "Insert relative to live siblings or append through a configured child array field.",
    code: `crud.insertAfter(siblingId, value)
crud.insertBefore(siblingId, value)
crud.appendChild(parentId, value)`,
  },
  {
    title: "Default create values",
    detail: "Omit value when defaultFor is configured or the child schema parses undefined, such as z.default().",
    code: `const crud = createJsonCrud(schema, initial, {
  defaultFor: (parentPath) => ({ text: "", children: [] }),
})

crud.create(childrenArrayId, 0)
crud.appendChild(parentId)`,
  },
];

export function ApiReference() {
  return (
    <section className="api-reference">
      <div className="api-reference-header">
        <div>
          <h2>API Reference</h2>
          <p>Public APIs added for domain editors built on top of the JsonDoc tree.</p>
        </div>
      </div>
      <div className="api-grid">
        {apiGroups.map((group) => (
          <article className="api-card" key={group.title}>
            <h3>{group.title}</h3>
            <p>{group.detail}</p>
            <pre><code>{group.code}</code></pre>
          </article>
        ))}
      </div>
    </section>
  );
}
