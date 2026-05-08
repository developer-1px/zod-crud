import { SourceTabs } from "../code/SourceTabs";
// SSOT: 실제 타입 정의.
import typesSrc from "../../../../packages/zod-crud/src/types.ts?raw";
import jsonDocSrc from "../../../../packages/zod-crud/src/document/json-doc.ts?raw";

export function Concepts() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-8">
      <article className="prose-doc">
        <h1>Concepts</h1>

        <h2>The commit pipeline</h2>
        <pre>{`input JSON
  → root schema safeParse()
  → parsed JSON output
  → serialize() into JsonDoc
  → node-id CRUD / clipboard / undo / redo
  → candidate JsonDoc
  → deserialize()
  → root schema safeParse()
  → exact parsed-output comparison
  → commit or reject`}</pre>

        <h2>Data model</h2>
        <p>
          A <code>JsonDoc</code> is a flat dictionary of <code>JsonNode</code>s indexed by
          <code>NodeId</code>. The root keeps a pointer; every other node carries
          <code>parentId</code> + <code>key</code>. Array indices are normalised after
          insert / delete so you never refer to a stale slot.
        </p>

        <h2>Source — types &amp; document</h2>
        <p>The two files below are the contract. Everything else is built on them.</p>
      </article>

      <div className="h-[520px]">
        <SourceTabs
          tabs={[
            { key: "types", label: "types.ts", filename: "types.ts", source: typesSrc },
            { key: "doc", label: "document/json-doc.ts", filename: "document/json-doc.ts", source: jsonDocSrc },
          ]}
          filenamePrefix="packages/zod-crud/src/"
        />
      </div>
    </main>
  );
}
