import type { ApiRun } from "./ApiRun.js";
import { stringify } from "./playground-helpers.js";

export function RunResult({ lastRun }: { lastRun: ApiRun }) {
  return (
    <pre className="json-output">{stringify({
      api: lastRun.api,
      call: lastRun.call,
      output: lastRun.output,
    })}</pre>
  );
}
