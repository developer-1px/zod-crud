import { useCallback, useMemo, useState } from "react";
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

export function App() {
  const [message, setMessage] = useState("ready");
  const doc = useJSONDocument(PageSchema, initialPage, { history: 50 });
  const form = createSchemaFormTree(doc);
  const json = useMemo(() => JSON.stringify(doc.value, null, 2), [doc.value]);

  const onFieldChange = useCallback((field: SchemaFormTreeField, next: unknown) => {
    const allowed = field.canSet(next);
    if (!allowed.ok) {
      setMessage(`${allowed.code}: ${field.path}`);
      return;
    }

    const result = field.set(next);
    setMessage(result.ok ? `set ${field.path}` : `${result.code}: ${field.path}`);
  }, []);

  return (
    <main className="schema-form-lab">
      <header className="schema-form-lab__bar">
        <h1>Schema form lab</h1>
        <div className="schema-form-lab__actions">
          <button type="button" onClick={() => doc.undo()} disabled={!doc.canUndo().ok}>undo</button>
          <button type="button" onClick={() => doc.redo()} disabled={!doc.canRedo().ok}>redo</button>
          <button type="button" onClick={() => { doc.reset(); setMessage("reset"); }}>reset</button>
        </div>
      </header>

      <div className="schema-form-lab__grid">
        <section className="schema-form-lab__form" aria-label="schema form">
          {form.ok ? (
            <FieldList fields={form.fields} onChange={onFieldChange} />
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
  onChange(field: SchemaFormTreeField, value: unknown): void;
}) {
  return (
    <div className="schema-form-lab__fields">
      {props.fields.map((field) => (
        <FieldNode key={field.path} field={field} onChange={props.onChange} />
      ))}
    </div>
  );
}

function FieldNode(props: {
  field: SchemaFormTreeField;
  onChange(field: SchemaFormTreeField, value: unknown): void;
}) {
  const { field, onChange } = props;

  if (field.fields && field.fields.length > 0) {
    return (
      <fieldset className="schema-form-lab__group">
        <legend>
          {field.key}
          <code>{field.path || "/"}</code>
        </legend>
        <FieldList fields={field.fields} onChange={onChange} />
      </fieldset>
    );
  }

  return <FieldEditor field={field} onChange={onChange} />;
}

function FieldEditor(props: {
  field: SchemaFormTreeField;
  onChange(field: SchemaFormTreeField, value: unknown): void;
}) {
  const { field, onChange } = props;
  const disabled = !field.canReplace.ok;
  const options = enumOptions(field);
  const id = `field-${field.path.replace(/[^a-zA-Z0-9_-]/g, "-") || "root"}`;

  return (
    <label className="schema-form-lab__field" htmlFor={id}>
      <span>
        {field.key}
        <code>{field.path}</code>
      </span>
      {field.kind === "boolean" ? (
        <input
          id={id}
          aria-label={field.path}
          type="checkbox"
          checked={Boolean(field.value)}
          disabled={disabled}
          onChange={(event) => onChange(field, event.currentTarget.checked)}
        />
      ) : field.kind === "number" ? (
        <input
          id={id}
          aria-label={field.path}
          type="number"
          value={typeof field.value === "number" ? field.value : ""}
          disabled={disabled}
          onChange={(event) => onChange(field, Number(event.currentTarget.value))}
        />
      ) : options.length > 0 ? (
        <select
          id={id}
          aria-label={field.path}
          value={typeof field.value === "string" ? field.value : ""}
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
          value={typeof field.value === "string" ? field.value : JSON.stringify(field.value)}
          disabled={disabled}
          onChange={(event) => onChange(field, event.currentTarget.value)}
        />
      )}
    </label>
  );
}

function enumOptions(field: SchemaFormTreeField): string[] {
  const schema = field.description?.jsonSchema;
  if (!schema || typeof schema !== "object") return [];
  const values = (schema as { enum?: unknown[] }).enum;
  return Array.isArray(values) && values.every((value): value is string => typeof value === "string")
    ? values
    : [];
}
