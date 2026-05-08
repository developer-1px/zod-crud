import { useEffect, useState } from "react";
import { z } from "zod";
import { createJsonCrud } from "zod-crud";

// 의도적으로 까다로운 스키마: 빈 문자열 금지 + 상한 100.
const Schema = z.object({
  count: z.number().int().min(0).max(100),
  label: z.string().min(1),
});

export function RejectedDrift() {
  const [crud] = useState(() => createJsonCrud(Schema, { count: 7, label: "ok" }));
  const [doc, setDoc] = useState(() => crud.snapshot());
  const [draft, setDraft] = useState("999");
  const [reason, setReason] = useState<string | null>(null);
  useEffect(() => crud.subscribe(() => setDoc(crud.snapshot())), [crud]);

  const root = doc.rootId;
  const countId = crud.find(root, "count")!;
  const count = doc.nodes[countId]!.value as number;

  const tryUpdate = () => {
    const next = Number(draft);
    if (!Number.isFinite(next)) {
      setReason("not a finite number");
      return;
    }
    const result = crud.update(countId, next);
    if (result.ok) setReason(null);
    else setReason(`rejected: ${result.reason}`);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="text-sm">current count = <strong>{count}</strong></div>
      <div className="flex gap-1.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="flex-1 rounded border border-stone-300 bg-white px-2 py-1 text-sm font-mono"
        />
        <button onClick={tryUpdate} className="rounded border border-stone-300 bg-white px-3 py-1 text-sm">update</button>
      </div>
      {reason && (
        <div className="rounded border border-rose-300 bg-rose-50 px-2 py-1 text-xs text-rose-800">
          {reason}
        </div>
      )}
      <p className="text-xs text-stone-500">
        Try 5 → committed. Try 999 → rejected by <code>z.number().max(100)</code>; doc, undo
        stack, and id allocator stay untouched.
      </p>
    </div>
  );
}
