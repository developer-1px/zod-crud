import { useEffect, useMemo, useState } from "react";
import {
  createComments,
  type Comment,
  type CommentSnapshot,
  type Comments,
} from "@zod-crud/comments";
import { useJSONDocument } from "zod-crud/react";
import { type Pointer } from "zod-crud";
import { z } from "zod";
import "./review-comments-lab.css";

const SectionSchema = z.object({
  id: z.string(),
  heading: z.string().min(1),
  body: z.string().min(1),
  approved: z.boolean(),
});

export const ReviewDocSchema = z.object({
  title: z.string().min(1),
  sections: z.array(SectionSchema),
});

export const initialReviewDoc: z.output<typeof ReviewDocSchema> = {
  title: "Release brief",
  sections: [
    {
      id: "intro",
      heading: "Intro",
      body: "Explain why this release matters.",
      approved: false,
    },
    {
      id: "api",
      heading: "API notes",
      body: "Mention that the public API is stable.",
      approved: false,
    },
    {
      id: "rollout",
      heading: "Rollout",
      body: "Publish after the review queue is clear.",
      approved: true,
    },
  ],
};

function createSeededComments<T>(doc: Parameters<typeof createComments<T>>[0]): Comments {
  const comments = createComments(doc);
  comments.add({
    id: "heading-review",
    pointer: "/sections/0/heading",
    text: "Make the opening more specific.",
    data: { author: "Ada" },
  });
  comments.add({
    id: "api-review",
    pointer: "/sections/1/body",
    text: "Clarify the stability guarantee.",
    data: { author: "Grace" },
  });
  return comments;
}

export function App() {
  const doc = useJSONDocument(ReviewDocSchema, initialReviewDoc, { history: 50 });
  const comments = useMemo(() => createSeededComments(doc), [doc]);
  const snapshot = useCommentSnapshot(comments);
  const [activePointer, setActivePointer] = useState<Pointer>("/sections/0/heading");
  const [draft, setDraft] = useState("Check wording.");
  const [message, setMessage] = useState("ready");

  const scopedComments = comments.forPointer(activePointer, {
    includeDescendants: true,
    includeResolved: true,
  });

  const addComment = () => {
    const result = comments.add({
      pointer: activePointer,
      text: draft,
      data: { author: "reviewer" },
    });
    setMessage(result.ok ? `comment ${result.comment.id}` : `${result.code}: ${activePointer}`);
  };

  const insertBefore = (index: number) => {
    const result = doc.insert(sectionPointer(index), {
      id: `new-${Date.now()}`,
      heading: "Inserted section",
      body: "New review target.",
      approved: false,
    });
    setMessage(result.ok ? "insert section" : result.code);
  };

  const deleteSection = (index: number) => {
    const pointer = sectionPointer(index);
    const result = doc.delete(pointer);
    setMessage(result.ok ? `delete ${pointer}` : result.code);
  };

  return (
    <main className="review-comments-lab">
      <header className="review-comments-lab__bar">
        <h1>Review comments lab</h1>
        <div className="review-comments-lab__actions">
          <button type="button" onClick={() => doc.undo()} disabled={!doc.canUndo().ok}>undo</button>
          <button type="button" onClick={() => doc.redo()} disabled={!doc.canRedo().ok}>redo</button>
          <button type="button" onClick={() => { doc.reset(); setMessage("reset"); }}>reset</button>
        </div>
      </header>

      <div className="review-comments-lab__metrics" aria-label="comment metrics">
        <strong aria-label="open comments">{snapshot.open}</strong>
        <span>open</span>
        <strong aria-label="resolved comments">{snapshot.resolved}</strong>
        <span>resolved</span>
        <strong aria-label="lost comments">{snapshot.lost}</strong>
        <span>lost</span>
      </div>

      <div className="review-comments-lab__grid">
        <section className="review-comments-lab__document" aria-label="review document">
          <h2>{doc.value.title}</h2>
          {doc.value.sections.map((section, index) => {
            const root = sectionPointer(index);
            const heading = `${root}/heading` as Pointer;
            const body = `${root}/body` as Pointer;
            const sectionComments = comments.forPointer(root, { includeDescendants: true, includeResolved: true });

            return (
              <article key={section.id}>
                <div className="review-comments-lab__section-actions">
                  <button type="button" onClick={() => insertBefore(index)} aria-label={`insert before ${root}`}>insert before</button>
                  <button type="button" onClick={() => deleteSection(index)} aria-label={`delete ${root}`}>delete</button>
                  <span>{sectionComments.ok ? sectionComments.comments.length : 0}</span>
                </div>
                <button
                  type="button"
                  className={activePointer === heading ? "selected" : ""}
                  onClick={() => setActivePointer(heading)}
                  aria-label={`select ${heading}`}
                >
                  {section.heading}
                </button>
                <button
                  type="button"
                  className={activePointer === body ? "selected" : ""}
                  onClick={() => setActivePointer(body)}
                  aria-label={`select ${body}`}
                >
                  {section.body}
                </button>
                <label>
                  <input
                    type="checkbox"
                    checked={section.approved}
                    onChange={(event) => {
                      const result = doc.replace(`${root}/approved` as Pointer, event.currentTarget.checked);
                      setMessage(result.ok ? `approved ${root}` : result.code);
                    }}
                    aria-label={`approved ${root}`}
                  />
                  approved
                </label>
              </article>
            );
          })}
        </section>

        <aside className="review-comments-lab__panel" aria-label="comments">
          <div className="review-comments-lab__target">
            <span>target</span>
            <code>{activePointer}</code>
          </div>
          <label className="review-comments-lab__draft">
            <span>comment</span>
            <input value={draft} onChange={(event) => setDraft(event.currentTarget.value)} aria-label="comment text" />
          </label>
          <button type="button" onClick={addComment}>add comment</button>

          <h2>Target comments</h2>
          <CommentList
            comments={scopedComments.ok ? scopedComments.comments : []}
            controls={comments}
          />

          <h2>All comments</h2>
          <CommentList comments={snapshot.comments} controls={comments} showPointer />
        </aside>
      </div>

      <p className="review-comments-lab__status" role="status">{message}</p>
    </main>
  );
}

function useCommentSnapshot(comments: Comments): CommentSnapshot {
  const [snapshot, setSnapshot] = useState(() => comments.current());

  useEffect(() => {
    setSnapshot(comments.current());
    const unsubscribe = comments.subscribe(setSnapshot);
    return () => {
      unsubscribe();
      comments.dispose();
    };
  }, [comments]);

  return snapshot;
}

function CommentList(props: {
  comments: ReadonlyArray<Comment>;
  controls: Comments;
  showPointer?: boolean;
}) {
  return (
    <ol className="review-comments-lab__comments">
      {props.comments.map((comment) => (
        <li key={comment.id}>
          <div>
            <strong>{comment.id}</strong>
            {props.showPointer ? <code>{comment.pointer ?? "lost"}</code> : null}
          </div>
          <p>{comment.text}</p>
          <span>{comment.status}{comment.lost ? " lost" : ""}</span>
          {comment.status === "open" ? (
            <button type="button" onClick={() => props.controls.resolve(comment.id)} aria-label={`resolve ${comment.id}`}>resolve</button>
          ) : (
            <button type="button" onClick={() => props.controls.reopen(comment.id)} aria-label={`reopen ${comment.id}`}>reopen</button>
          )}
        </li>
      ))}
    </ol>
  );
}

function sectionPointer(index: number): Pointer {
  return `/sections/${index}` as Pointer;
}
