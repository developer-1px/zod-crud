import { useEffect, useMemo, useState } from "react";
import { createProposedChanges, type ProposedChangePlanResult } from "@interactive-os/json-document-proposed-changes";
import { useJSONDocument } from "@interactive-os/json-document/react";
import { z } from "zod";
import "./proposed-changes-lab.css";

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
  const proposedChanges = useMemo(() => createProposedChanges(doc), [doc]);
  const [, refresh] = useState(0);
  const [message, setMessage] = useState("ready");

  useEffect(() => proposedChanges.subscribe(() => refresh((version) => version + 1)), [proposedChanges]);

  const open = proposedChanges.current();
  const all = proposedChanges.current({ status: "all" });
  const firstOpen = open.changes[0];
  const canAccept = firstOpen === undefined ? empty("accept") : proposedChanges.canAccept(firstOpen.id);
  const canReject = firstOpen === undefined ? empty("reject") : proposedChanges.canReject(firstOpen.id);
  const renamePlan = proposedChanges.canPropose({
    operations: { op: "replace", path: "/title", value: "Reviewed page" },
  });
  const invalidPlan = proposedChanges.canPropose({
    operations: { op: "replace", path: "/status", value: "invalid" },
  });

  const proposeRename = () => {
    const result = proposedChanges.propose({
      operations: { op: "replace", path: "/title", value: "Reviewed page" },
      label: "Rename title",
    });
    setMessage(result.ok ? `proposed ${result.change.id}` : result.code);
  };

  const proposeInvalid = () => {
    const result = proposedChanges.propose({
      operations: { op: "replace", path: "/status", value: "invalid" },
      label: "Invalid status",
    });
    setMessage(result.ok ? `proposed ${result.change.id}` : result.code);
  };

  const accept = () => {
    if (firstOpen === undefined) return;
    const result = proposedChanges.accept(firstOpen.id, { label: "accept patch change" });
    setMessage(result.ok ? `accepted ${result.change.id}` : result.code);
  };

  const reject = () => {
    if (firstOpen === undefined) return;
    const result = proposedChanges.reject(firstOpen.id);
    setMessage(result.ok ? `rejected ${result.change.id}` : result.code);
  };

  const directEdit = () => {
    const result = doc.replace("/title", "Edited directly");
    setMessage(result.ok ? "direct edit" : result.code);
  };

  const reset = () => {
    doc.reset();
    proposedChanges.clear();
    setMessage("reset");
  };

  return (
    <main className="proposed-changes-lab">
      <header className="proposed-changes-lab__bar">
        <h1>Proposed changes lab</h1>
        <button type="button" onClick={reset}>reset</button>
      </header>

      <section className="proposed-changes-lab__layout">
        <aside className="proposed-changes-lab__commands" aria-label="commands">
          <CommandButton label="propose title" capability={renamePlan} onClick={proposeRename} />
          <CommandButton label="propose invalid" capability={invalidPlan} onClick={proposeInvalid} />
          <CommandButton label="accept first" capability={canAccept} onClick={accept} />
          <CommandButton label="reject first" capability={canReject} onClick={reject} />
          <button type="button" onClick={directEdit}>direct edit</button>
        </aside>

        <section className="proposed-changes-lab__document" aria-label="document">
          <div><span>title</span><strong>{doc.value.title}</strong></div>
          <div><span>status</span><strong>{doc.value.status}</strong></div>
          {doc.value.sections.map((section) => (
            <div key={section.id}><span>{section.id}</span><strong>{section.title}</strong></div>
          ))}
        </section>

        <section className="proposed-changes-lab__changes" aria-label="proposed changes">
          <div className="proposed-changes-lab__counts">
            <code>open {all.open}</code>
            <code>accepted {all.accepted}</code>
            <code>rejected {all.rejected}</code>
          </div>
          {all.changes.map((change) => (
            <article key={change.id}>
              <strong>{change.label ?? change.id}</strong>
              <code>{change.status}</code>
              <code>{change.operations[0]?.path}</code>
            </article>
          ))}
        </section>
      </section>

      <p className="proposed-changes-lab__status" role="status">{message}</p>
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

function empty(action: "accept" | "reject"): ProposedChangePlanResult {
  return {
    ok: false,
    code: "not_found",
    reason: `no change to ${action}`,
  };
}
