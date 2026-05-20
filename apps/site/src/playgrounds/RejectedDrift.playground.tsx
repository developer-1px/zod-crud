import { useState } from "react";
import { z } from "zod";
import type { JSONResult } from "zod-crud";
import { useJSONDocument } from "zod-crud/react";

const Schema = z.object({
  count: z.number().int().min(0).max(100),
  label: z.string().min(1),
});

export const playground = {
  id: "rejected-drift",
  order: 3,
  label: "Rejected Drift",
  exports: ["useJSONDocument", "JSONResult"],
  sources: [
    "apps/site/src/playgrounds/RejectedDrift.playground.tsx",
    "packages/zod-crud/src/core/schema/validate.ts",
    "packages/zod-crud/src/createJSONDocument.ts",
  ],
} as const;

export function RejectedDrift() {
  const { value: json, ops } = useJSONDocument(
    Schema,
    { count: 7, label: "ok" },
    { strict: false },
  );
  const [draft, setDraft] = useState("999");
  const [reason, setReason] = useState<string | null>(null);

  const tryUpdate = () => {
    const next = Number(draft);
    if (!Number.isFinite(next)) {
      setReason("not a finite number");
      return;
    }

    const result: JSONResult = ops.replace("/count", next);
    if (result.ok) setReason(null);
    else setReason(`rejected: ${result.code}`);
  };

  return (
    <div className="flex max-w-sm flex-col gap-2">
      <div className="text-sm">count = <strong>{json.count}</strong></div>
      <div className="flex gap-1.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="min-w-0 flex-1 rounded border border-stone-300 bg-white px-2 py-1 text-sm font-mono"
        />
        <button onClick={tryUpdate} className="rounded border border-stone-300 bg-white px-3 py-1 text-sm">update</button>
      </div>
      {reason ? (
        <div role="status" className="rounded border border-rose-300 bg-rose-50 px-2 py-1 text-xs text-rose-800">
          {reason}
        </div>
      ) : null}
    </div>
  );
}

export default RejectedDrift;
