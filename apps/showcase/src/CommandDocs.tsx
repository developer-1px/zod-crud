import type { ApiId } from "./api-catalog.js";
import {
  commandByApi,
  commandInputLabel,
} from "./command-matrix.js";

export function CommandDocs({
  activeApi,
  subscriptionEvents,
}: {
  activeApi: ApiId;
  subscriptionEvents: number;
}) {
  const command = commandByApi(activeApi);

  return (
    <section className="workbench-section docs-section">
      <h3>Docs</h3>
      <dl className="command-docs">
        <div>
          <dt>User input</dt>
          <dd>{commandInputLabel(command.input)}</dd>
        </div>
        <div>
          <dt>Keymap</dt>
          <dd>{command.keys === "" ? "manual only" : command.keys}</dd>
        </div>
        <div>
          <dt>Public call</dt>
          <dd><code>{command.call}</code></dd>
        </div>
        <div>
          <dt>Subscription events</dt>
          <dd>{subscriptionEvents}</dd>
        </div>
      </dl>
      {command.notes === "" ? null : <p className="api-hint">{command.notes}</p>}
    </section>
  );
}
