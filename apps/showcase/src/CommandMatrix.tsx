import type { ApiId } from "./api-catalog.js";
import {
  commandInputLabel,
  userCommands,
} from "./command-matrix.js";

export function CommandMatrix({
  activeApi,
  onRun,
  onSelect,
}: {
  activeApi: ApiId;
  onRun: (api: ApiId) => void;
  onSelect: (api: ApiId) => void;
}) {
  return (
    <div className="command-table-wrap">
      <table className="command-table">
        <thead>
          <tr>
            <th>Group</th>
            <th>API</th>
            <th>Key</th>
            <th>Input</th>
            <th>Run</th>
          </tr>
        </thead>
        <tbody>
          {userCommands.map((command) => (
            <tr key={command.api} className={activeApi === command.api ? "is-active" : ""}>
              <td className="command-group-cell">{command.group}</td>
              <td>
                <button type="button" className="command-api-button" onClick={() => onSelect(command.api)}>
                  <strong>{command.api}</strong>
                  <span>{command.call}</span>
                </button>
              </td>
              <td>{command.keys === "" ? <span className="muted">manual</span> : <kbd>{command.keys}</kbd>}</td>
              <td>{commandInputLabel(command.input)}</td>
              <td>
                <button type="button" className="icon-run-button" onClick={() => onRun(command.api)} aria-label={`Run ${command.api}`}>
                  Run
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
