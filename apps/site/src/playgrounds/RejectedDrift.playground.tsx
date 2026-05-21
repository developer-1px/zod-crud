import { useState } from "react";
import { z } from "zod/mini";
import type { ZodType } from "zod";
import type { JSONResult } from "zod-crud";
import { useJSONDocument } from "zod-crud/react";

type RejectedDriftValue = {
  count: number;
  label: string;
};

const Schema = z.object({
  count: z.number().check(z.int(), z.minimum(0), z.maximum(100)),
  label: z.string().check(z.minLength(1)),
}) as unknown as ZodType<RejectedDriftValue, RejectedDriftValue>;

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
