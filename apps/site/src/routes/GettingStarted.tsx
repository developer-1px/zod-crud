import { SourceTabs } from "../code/SourceTabs";
import gettingStartedSnippetRaw from "../examples/snippet-getting-started.ts?raw";

export function GettingStarted() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-8">
      <article className="prose-doc">
        <h1>Getting started</h1>

        <h2>Install</h2>
        <pre>{`npm install zod-crud zod`}</pre>

        <h2>Your first editor</h2>
        <p>
          Pass the root schema and an initial value. <code>createJsonCrud</code> rejects
          any initial that isn't already a valid parse-stable instance — so the editor
          starts from a known-good state.
        </p>
      </article>

      <div className="h-[520px]">
        <SourceTabs
          tabs={[{
            key: "snippet",
            label: "first-editor.ts",
            filename: "first-editor.ts",
            source: gettingStartedSnippetRaw,
          }]}
          filenamePrefix="example: "
        />
      </div>

      <article className="prose-doc">
        <h2>Subscribing to commits</h2>
        <p>
          <code>crud.subscribe(fn)</code> fires after every successful commit. UI layers
          (React, Solid, plain DOM) can re-render on that. Failed mutations never trigger
          subscribers — there's no half-applied state to fan out.
        </p>
      </article>
    </main>
  );
}
