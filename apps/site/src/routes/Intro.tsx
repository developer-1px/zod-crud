import { SourceTabs } from "../code/SourceTabs";
// SSOT: 라이브러리 패키지의 실제 진입 파일.
import indexSrc from "../../../../packages/zod-crud/src/index.ts?raw";

export function Intro() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-8">
      <article className="prose-doc">
        <h1>What is zod-crud?</h1>
        <p>
          <code>zod-crud</code> is a flat JSON tree library guarded by a Zod schema —
          not an editor, but the engine underneath one. It parses your JSON once with
          the root schema, stores it as a flat node table, and exposes CRUD / clipboard /
          undo / redo operations over node ids. UI is out of scope; bring your own.
        </p>
        <p>
          Every candidate mutation has to deserialize back into JSON that
          <strong> exactly equals</strong> the new schema-parsed output. If Zod would
          strip, coerce, transform, or default any byte, the mutation is rejected and
          state is left untouched.
        </p>
        <h2>Why flat?</h2>
        <p>
          Tree edits are lossy and ambiguous in nested form. By assigning a stable
          <code>NodeId</code> to every value — root, key, array slot, primitive — the
          public API can stay tiny: <code>create</code> · <code>update</code> ·
          <code>rename</code> · <code>delete</code> · <code>copy</code> ·
          <code>cut</code> · <code>paste</code> · <code>undo</code> · <code>redo</code>.
        </p>
        <h2>Public surface (SSOT)</h2>
        <p>
          The single source of truth for what ships from the package — straight from
          <code>packages/zod-crud/src/index.ts</code>:
        </p>
      </article>

      <div className="h-[420px]">
        <SourceTabs
          tabs={[{ key: "index", label: "index.ts", filename: "index.ts", source: indexSrc }]}
          filenamePrefix="packages/zod-crud/src/"
        />
      </div>
    </main>
  );
}
