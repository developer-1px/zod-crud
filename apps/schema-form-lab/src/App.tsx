import { useCallback, useMemo, useState } from "react";
import {
  createFormDraft,
  type FormDraftParser,
  type FormDraftSnapshot,
  type FormDrafts,
} from "@zod-crud/form-draft";
import { createSchemaFormTree, type SchemaFormTreeField } from "@zod-crud/schema-form";
import { useJSONDocument } from "zod-crud/react";
import { z } from "zod";
import "./schema-form-lab.css";

const BlockSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("text"),
    text: z.string(),
  }),
  z.object({
    kind: z.literal("link"),
    label: z.string(),
    href: z.string().url(),
  }),
]);

export const PageSchema = z.object({
  title: z.string(),
  status: z.enum(["draft", "review", "live"]),
  published: z.boolean(),
  seo: z.object({
    title: z.string(),
    noIndex: z.boolean(),
  }),
  blocks: z.array(BlockSchema),
});

export const initialPage: z.output<typeof PageSchema> = {
  title: "Draft page",
  status: "draft",
  published: false,
  seo: {
    title: "Draft page",
    noIndex: true,
  },
  blocks: [
    { kind: "text", text: "Edit structured data through descriptors." },
    { kind: "link", label: "Docs", href: "https://example.com/docs" },
  ],
};

const parseFormInput: FormDraftParser<unknown> = ({ input, kind }) => {
  if (kind !== "number") return { ok: true, value: input };
  if (typeof input === "number") return { ok: true, value: input };
  if (typeof input !== "string") return { ok: false, reason: "expected number input" };

  const trimmed = input.trim();
  if (trimmed.length === 0) return { ok: false, reason: "empty number" };

  const value = Number(trimmed);
  return Number.isFinite(value)
    ? { ok: true, value }
    : { ok: false, reason: "not a number" };
};

export function App() {
  const [message, setMessage] = useState("ready");
  const [draftVersion, setDraftVersion] = useState(0);
  const doc = useJSONDocument(PageSchema, initialPage, { history: 50 });
  const drafts = useMemo(() => createFormDraft(doc, { parse: parseFormInput }), [doc]);
  const draftSnapshots = useMemo(() => drafts.currentAll(), [drafts, draftVersion]);
  const form = createSchemaFormTree(doc);
  const json = useMemo(() => JSON.stringify(doc.value, null, 2), [doc.value]);
  const invalidDrafts = draftSnapshots.filter((snapshot) => !snapshot.valid).length;
  const canCommitDrafts = draftSnapshots.length > 0 && invalidDrafts === 0;

  const refreshDrafts = useCallback(() => {
    setDraftVersion((version) => version + 1);
  }, []);

  const onFieldChange = useCallback((field: SchemaFormTreeField, next: unknown) => {
    const result = drafts.set(field.path, next);
    refreshDrafts();
    if (!result.ok) {
      setMessage(`${result.code}: ${field.path}`);
      return;
    }

    const error = result.snapshot.error;
    setMessage(error === null ? `draft ${field.path}` : `${error.capability?.code ?? error.code}: ${field.path}`);
  }, [drafts, refreshDrafts]);

  const onCommitDrafts = useCallback(() => {
    const result = drafts.commitAll();
    refreshDrafts();
    if (!result.ok) {
      setMessage(`${result.code}: ${result.pointer ?? ""}`.trim());
      return;
    }
    setMessage(`committed ${result.operations.length} draft(s)`);
  }, [drafts, refreshDrafts]);

  const onClearDrafts = useCallback(() => {
    drafts.clear();
    refreshDrafts();
    setMessage("drafts cleared");
  }, [drafts, refreshDrafts]);

  return (
    <main className="schema-form-lab">
      <header className="schema-form-lab__bar">
        <h1>Schema form lab</h1>
        <div className="schema-form-lab__actions">
          <button type="button" onClick={onCommitDrafts} disabled={!canCommitDrafts}>commit drafts</button>
          <button type="button" onClick={onClearDrafts} disabled={draftSnapshots.length === 0}>clear drafts</button>
          <button type="button" onClick={() => doc.undo()} disabled={!doc.canUndo().ok}>undo</button>
          <button type="button" onClick={() => doc.redo()} disabled={!doc.canRedo().ok}>redo</button>
          <button type="button" onClick={() => {
            drafts.clear();
            refreshDrafts();
            doc.reset();
            setMessage("reset");
          }}>reset</button>
        </div>
      </header>

      <div className="schema-form-lab__grid">
        <section className="schema-form-lab__form" aria-label="schema form">
          {form.ok ? (
            <FieldList fields={form.fields} drafts={drafts} onChange={onFieldChange} />
          ) : (
            <p role="alert">{form.code}: {form.pointer}</p>
          )}
        </section>
        <section className="schema-form-lab__state" aria-label="document state">
          <pre>{json}</pre>
        </section>
      </div>

      <p className="schema-form-lab__status" role="status">{message}</p>
    </main>
  );
}

function FieldList(props: {
  fields: ReadonlyArray<SchemaFormTreeField>;
  drafts: FormDrafts;
  onChange(field: SchemaFormTreeField, value: unknown): void;
}) {
  return (
    <div className="schema-form-lab__fields">
      {props.fields.map((field) => (
        <FieldNode key={field.path} field={field} drafts={props.drafts} onChange={props.onChange} />
      ))}
    </div>
  );
}

function FieldNode(props: {
  field: SchemaFormTreeField;
  drafts: FormDrafts;
  onChange(field: SchemaFormTreeField, value: unknown): void;
}) {
  const { field, drafts, onChange } = props;

  if (field.fields && field.fields.length > 0) {
    return (
      <fieldset className="schema-form-lab__group">
        <legend>
          {field.key}
          <code>{field.path || "/"}</code>
        </legend>
        <FieldList fields={field.fields} drafts={drafts} onChange={onChange} />
      </fieldset>
    );
  }

  return <FieldEditor field={field} drafts={drafts} onChange={onChange} />;
}

function FieldEditor(props: {
  field: SchemaFormTreeField;
  drafts: FormDrafts;
  onChange(field: SchemaFormTreeField, value: unknown): void;
}) {
  const { field, drafts, onChange } = props;
  const disabled = !field.canReplace.ok;
  const options = enumOptions(field);
  const id = `field-${field.path.replace(/[^a-zA-Z0-9_-]/g, "-") || "root"}`;
  const draft = drafts.current(field.path);
  const error = draft?.error ?? null;

  return (
    <label
      className="schema-form-lab__field"
      data-invalid={error === null ? "false" : "true"}
      htmlFor={id}
    >
      <span>
        {field.key}
        <code>{field.path}</code>
      </span>
      {field.kind === "boolean" ? (
        <input
          id={id}
          aria-label={field.path}
          type="checkbox"
          checked={draft === null ? Boolean(field.value) : Boolean(draft.input)}
          disabled={disabled}
          onChange={(event) => onChange(field, event.currentTarget.checked)}
        />
      ) : field.kind === "number" ? (
        <input
          id={id}
          aria-label={field.path}
          inputMode="decimal"
          value={draft === null ? numberFieldValue(field.value) : draftInputText(draft.input)}
          disabled={disabled}
          onChange={(event) => onChange(field, event.currentTarget.value)}
        />
      ) : options.length > 0 ? (
        <select
          id={id}
          aria-label={field.path}
          value={draft === null ? stringFieldValue(field.value) : draftInputText(draft.input)}
          disabled={disabled}
          onChange={(event) => onChange(field, event.currentTarget.value)}
        >
          {options.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          aria-label={field.path}
          value={draft === null ? stringFieldValue(field.value) : draftInputText(draft.input)}
          disabled={disabled}
          onChange={(event) => onChange(field, event.currentTarget.value)}
        />
      )}
      {error === null ? null : <small role="alert">{error.reason}</small>}
    </label>
  );
}

function numberFieldValue(value: unknown): string {
  return typeof value === "number" ? String(value) : "";
}

function stringFieldValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  return JSON.stringify(value);
}

function draftInputText(input: FormDraftSnapshot["input"]): string {
  return typeof input === "string" ? input : stringFieldValue(input);
}

function enumOptions(field: SchemaFormTreeField): string[] {
  const schema = field.description?.jsonSchema;
  if (!schema || typeof schema !== "object") return [];
  const values = (schema as { enum?: unknown[] }).enum;
  return Array.isArray(values) && values.every((value): value is string => typeof value === "string")
    ? values
    : [];
}
