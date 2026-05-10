import { useState } from "react";
import { z } from "zod";
import { useJson, JsonCrudError } from "zod-crud";

const Schema = z.object({
  title: z.string().min(1),
  tasks: z.array(
    z.object({
      id: z.string(),
      text: z.string(),
      done: z.boolean(),
    }),
  ),
});

type Task = z.output<typeof Schema>["tasks"][number];

const newTask = (): Task => ({
  id: crypto.randomUUID(),
  text: "",
  done: false,
});

export function App() {
  const [error, setError] = useState<string | null>(null);
  const [json, ops] = useJson(
    Schema,
    { title: "draft", tasks: [newTask()] },
    {
      history: 50,
      strict: false,
      onError: (e: JsonCrudError) => setError(`${e.result.code}: ${e.result.reason ?? ""}`),
    },
  );

  return (
    <div className="app">
      <h1>zod-crud</h1>
      <div className="tag">RFC 6901 + RFC 6902 — useJson hook demo</div>

      <div className="section">
        <h2>title (replace)</h2>
        <div className="row">
          <input
            type="text"
            value={json.title}
            onChange={(e) => {
              setError(null);
              ops.replace("/title", e.target.value);
            }}
          />
        </div>
      </div>

      <div className="section">
        <h2>tasks (add / remove / replace / move)</h2>
        <div className="toolbar">
          <button onClick={() => { setError(null); ops.add("/tasks/-", newTask()); }}>
            add at end
          </button>
          <button onClick={() => { setError(null); ops.add("/tasks/0", newTask()); }}>
            add at 0
          </button>
          <button onClick={() => { setError(null); ops.undo(); }} disabled={!ops.canUndo()}>
            undo
          </button>
          <button onClick={() => { setError(null); ops.redo(); }} disabled={!ops.canRedo()}>
            redo
          </button>
          <button onClick={() => { setError(null); ops.reset(); }}>
            reset
          </button>
        </div>
        {json.tasks.map((task, i) => (
          <div className="row" key={task.id}>
            <input
              type="checkbox"
              checked={task.done}
              onChange={(e) => {
                setError(null);
                ops.replace(`/tasks/${i}/done` as `/tasks/${number}/done`, e.target.checked);
              }}
            />
            <input
              type="text"
              value={task.text}
              onChange={(e) => {
                setError(null);
                ops.replace(`/tasks/${i}/text` as `/tasks/${number}/text`, e.target.value);
              }}
            />
            <button
              onClick={() => {
                setError(null);
                ops.move(
                  `/tasks/${i}` as `/tasks/${number}`,
                  `/tasks/${i - 1}` as `/tasks/${number}`,
                );
              }}
              disabled={i === 0}
            >
              ↑
            </button>
            <button
              onClick={() => {
                setError(null);
                ops.move(
                  `/tasks/${i}` as `/tasks/${number}`,
                  `/tasks/${i + 1}` as `/tasks/${number}`,
                );
              }}
              disabled={i === json.tasks.length - 1}
            >
              ↓
            </button>
            <button
              onClick={() => {
                setError(null);
                ops.copy(
                  `/tasks/${i}` as `/tasks/${number}`,
                  "/tasks/-",
                );
              }}
            >
              copy
            </button>
            <button
              onClick={() => {
                setError(null);
                ops.remove(`/tasks/${i}` as `/tasks/${number}`);
              }}
            >
              remove
            </button>
          </div>
        ))}
        {error && <div className="error">{error}</div>}
      </div>

      <div className="section">
        <h2>state (G1 — pure JSON)</h2>
        <pre>{JSON.stringify(json, null, 2)}</pre>
      </div>
    </div>
  );
}
