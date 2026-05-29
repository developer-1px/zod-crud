import { useEffect, useMemo, useState } from "react";
import { createSuggestions, type SuggestionPlanResult } from "@zod-crud/suggestions";
import { useJSONDocument } from "zod-crud/react";
import { z } from "zod";
import "./suggestions-lab.css";

const SectionSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
});

export const PageSchema = z.object({
  title: z.string().min(1),
  status: z.enum(["draft", "review", "published"]),
  sections: z.array(SectionSchema),
});

export const initialPage: z.output<typeof PageSchema> = {
  title: "Draft page",
  status: "draft",
  sections: [
    { id: "intro", title: "Intro" },
    { id: "body", title: "Body" },
  ],
};

export function App() {
  const doc = useJSONDocument(PageSchema, initialPage, { history: 50 });
  const suggestions = useMemo(() => createSuggestions(doc), [doc]);
  const [, refresh] = useState(0);
  const [message, setMessage] = useState("ready");

  useEffect(() => suggestions.subscribe(() => refresh((version) => version + 1)), [suggestions]);

  const open = suggestions.current();
  const all = suggestions.current({ status: "all" });
  const firstOpen = open.suggestions[0];
  const canAccept = firstOpen === undefined ? empty("accept") : suggestions.canAccept(firstOpen.id);
  const canReject = firstOpen === undefined ? empty("reject") : suggestions.canReject(firstOpen.id);
  const renamePlan = suggestions.canPropose({
    operations: { op: "replace", path: "/title", value: "Reviewed page" },
  });
  const invalidPlan = suggestions.canPropose({
    operations: { op: "replace", path: "/status", value: "invalid" },
  });

  const proposeRename = () => {
    const result = suggestions.propose({
      operations: { op: "replace", path: "/title", value: "Reviewed page" },
      label: "Rename title",
    });
    setMessage(result.ok ? `proposed ${result.suggestion.id}` : result.code);
  };

  const proposeInvalid = () => {
    const result = suggestions.propose({
      operations: { op: "replace", path: "/status", value: "invalid" },
      label: "Invalid status",
    });
    setMessage(result.ok ? `proposed ${result.suggestion.id}` : result.code);
  };

  const accept = () => {
    if (firstOpen === undefined) return;
    const result = suggestions.accept(firstOpen.id, { label: "accept suggestion" });
    setMessage(result.ok ? `accepted ${result.suggestion.id}` : result.code);
  };

  const reject = () => {
    if (firstOpen === undefined) return;
    const result = suggestions.reject(firstOpen.id);
    setMessage(result.ok ? `rejected ${result.suggestion.id}` : result.code);
  };

  const directEdit = () => {
    const result = doc.replace("/title", "Edited directly");
    setMessage(result.ok ? "direct edit" : result.code);
  };

  const reset = () => {
    doc.reset();
    suggestions.clear();
    setMessage("reset");
  };

  return (
    <main className="suggestions-lab">
      <header className="suggestions-lab__bar">
        <h1>Suggestions lab</h1>
        <button type="button" onClick={reset}>reset</button>
      </header>

      <section className="suggestions-lab__layout">
        <aside className="suggestions-lab__commands" aria-label="commands">
          <CommandButton label="propose title" capability={renamePlan} onClick={proposeRename} />
          <CommandButton label="propose invalid" capability={invalidPlan} onClick={proposeInvalid} />
          <CommandButton label="accept first" capability={canAccept} onClick={accept} />
          <CommandButton label="reject first" capability={canReject} onClick={reject} />
          <button type="button" onClick={directEdit}>direct edit</button>
        </aside>

        <section className="suggestions-lab__document" aria-label="document">
          <div><span>title</span><strong>{doc.value.title}</strong></div>
          <div><span>status</span><strong>{doc.value.status}</strong></div>
          {doc.value.sections.map((section) => (
            <div key={section.id}><span>{section.id}</span><strong>{section.title}</strong></div>
          ))}
        </section>

        <section className="suggestions-lab__suggestions" aria-label="suggestions">
          <div className="suggestions-lab__counts">
            <code>open {all.open}</code>
            <code>accepted {all.accepted}</code>
            <code>rejected {all.rejected}</code>
          </div>
          {all.suggestions.map((suggestion) => (
            <article key={suggestion.id}>
              <strong>{suggestion.label ?? suggestion.id}</strong>
              <code>{suggestion.status}</code>
              <code>{suggestion.operations[0]?.path}</code>
            </article>
          ))}
        </section>
      </section>

      <p className="suggestions-lab__status" role="status">{message}</p>
    </main>
  );
}

function CommandButton(props: {
  label: string;
  capability: { ok: boolean; code?: string };
  onClick(): void;
}) {
  return (
    <button type="button" onClick={props.onClick} disabled={!props.capability.ok} aria-label={props.label}>
      <span>{props.label}</span>
      <code>{props.capability.ok ? "ok" : props.capability.code}</code>
    </button>
  );
}

function empty(action: "accept" | "reject"): SuggestionPlanResult {
  return {
    ok: false,
    code: "not_found",
    reason: `no suggestion to ${action}`,
  };
}
