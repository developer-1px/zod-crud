import { useMemo, useState } from "react";
import {
  createSearchReplace,
  type SearchReplaceMatch,
  type TextMatchRange,
} from "@interactive-os/json-document-search-replace";
import { useJSONDocument } from "@interactive-os/json-document/react";
import { z } from "zod";
import "./copy-review-lab.css";

const ArticleSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  body: z.string().min(1),
  notes: z.array(z.string()),
});

export const CopyReviewSchema = z.object({
  issue: z.object({
    title: z.string().min(1),
    audience: z.enum(["internal", "public"]),
  }),
  articles: z.array(ArticleSchema),
  archive: z.object({
    note: z.string(),
  }),
});

export const initialCopy: z.output<typeof CopyReviewSchema> = {
  issue: {
    title: "Draft launch notes",
    audience: "internal",
  },
  articles: [
    {
      id: "intro",
      title: "Draft overview",
      body: "This draft explains the draft API surface.",
      notes: ["Replace draft wording before public review."],
    },
    {
      id: "guide",
      title: "Migration guide",
      body: "Use draft examples only in the staging copy.",
      notes: ["Keep DONE unchanged."],
    },
  ],
  archive: {
    note: "draft archive marker",
  },
};

type Scope = "" | "/articles" | "/issue" | "/archive";

const scopeOptions: ReadonlyArray<{ label: string; value: Scope }> = [
  { label: "Document", value: "" },
  { label: "Articles", value: "/articles" },
  { label: "Issue", value: "/issue" },
  { label: "Archive", value: "/archive" },
];

export function App() {
  const [query, setQuery] = useState("draft");
  const [replacement, setReplacement] = useState("final");
  const [scope, setScope] = useState<Scope>("/articles");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [message, setMessage] = useState("ready");
  const doc = useJSONDocument(CopyReviewSchema, initialCopy, { history: 50 });
  const search = createSearchReplace(doc);
  const options = { root: scope, caseSensitive };
  const found = query.length > 0 ? search.find(query, options) : null;
  const allChange = query.length > 0
    ? search.canReplaceAll(query, replacement, options)
    : null;
  const occurrences = useMemo(() => found?.ok ? flattenMatches(found.matches) : [], [found]);

  const replaceOne = (match: SearchReplaceMatch, range: TextMatchRange) => {
    const result = search.replaceMatch({ pointer: match.pointer, range }, replacement);
    setMessage(result.ok ? `replace ${match.pointer}` : `${result.code}: ${result.pointer ?? match.pointer}`);
  };

  const replaceAll = () => {
    const result = search.replaceAll(query, replacement, options);
    setMessage(result.ok ? `replace all ${result.count}` : `${result.code}: ${result.pointer ?? (scope || "/")}`);
  };

  const disabledReason = allChange !== null && !allChange.ok ? allChange.code : null;
  const canReplaceAll = allChange?.ok === true && allChange.operations.length > 0;

  return (
    <main className="copy-review-lab">
      <header className="copy-review-lab__bar">
        <h1>Copy review lab</h1>
        <div className="copy-review-lab__actions">
          <button type="button" onClick={() => doc.undo()} disabled={!doc.canUndo().ok}>undo</button>
          <button type="button" onClick={() => doc.redo()} disabled={!doc.canRedo().ok}>redo</button>
          <button type="button" onClick={() => { doc.reset(); setMessage("reset"); }}>reset</button>
        </div>
      </header>

      <section className="copy-review-lab__controls" aria-label="search controls">
        <label>
          <span>find</span>
          <input value={query} onChange={(event) => setQuery(event.currentTarget.value)} aria-label="find text" />
        </label>
        <label>
          <span>replace</span>
          <input value={replacement} onChange={(event) => setReplacement(event.currentTarget.value)} aria-label="replace text" />
        </label>
        <label>
          <span>scope</span>
          <select value={scope} onChange={(event) => setScope(event.currentTarget.value as Scope)} aria-label="scope">
            {scopeOptions.map((option) => (
              <option key={option.value || "root"} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label className="copy-review-lab__case">
          <input
            type="checkbox"
            checked={caseSensitive}
            onChange={(event) => setCaseSensitive(event.currentTarget.checked)}
            aria-label="case sensitive"
          />
          <span>case</span>
        </label>
        <button type="button" onClick={replaceAll} disabled={!canReplaceAll} aria-label="replace all">
          replace all
        </button>
      </section>

      <div className="copy-review-lab__grid">
        <section className="copy-review-lab__matches" aria-label="matches">
          <div className="copy-review-lab__summary">
            <strong aria-label="match count">{found?.ok ? found.count : 0}</strong>
            <span>{disabledReason ?? "matches"}</span>
          </div>
          {found !== null && !found.ok ? (
            <p role="alert">{found.code}: {found.pointer ?? (scope || "/")}</p>
          ) : (
            <ol>
              {occurrences.map(({ match, range }, index) => (
                <li key={`${match.pointer}:${range.start}:${range.end}`}>
                  <code>{match.pointer}</code>
                  <p>{preview(match.value, range)}</p>
                  <button type="button" onClick={() => replaceOne(match, range)}>
                    replace
                  </button>
                  <span>{index + 1}</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="copy-review-lab__document" aria-label="copy document">
          <h2>{doc.value.issue.title}</h2>
          {doc.value.articles.map((article) => (
            <article key={article.id}>
              <h3>{article.title}</h3>
              <p>{article.body}</p>
              <ul>
                {article.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </article>
          ))}
          <footer>{doc.value.archive.note}</footer>
        </section>
      </div>

      <p className="copy-review-lab__status" role="status">{message}</p>
    </main>
  );
}

function flattenMatches(matches: ReadonlyArray<SearchReplaceMatch>) {
  return matches.flatMap((match) => match.ranges.map((range) => ({ match, range })));
}

function preview(value: string, range: TextMatchRange): string {
  const before = value.slice(Math.max(0, range.start - 18), range.start);
  const text = value.slice(range.start, range.end);
  const after = value.slice(range.end, Math.min(value.length, range.end + 18));
  return `${before}[${text}]${after}`;
}
