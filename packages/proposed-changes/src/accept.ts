import type {
  JSONDocument,
} from "zod-crud";

import {
  cloneJson,
  copyChange,
} from "./copy.js";
import {
  capabilityError,
  notFound,
  notOpen,
  proposedChangeError,
} from "./errors.js";
import type {
  ProposedChange,
  ProposedChangeError,
  ProposedChangeResult,
} from "./types.js";

export function canAcceptChange<TDocument>(
  doc: JSONDocument<TDocument>,
  changes: ReadonlyMap<string, ProposedChange>,
  id: string,
): ProposedChangeResult {
  const change = changes.get(id);
  if (change === undefined) return notFound(id);
  if (change.status !== "open") return notOpen(id, change.status);

  const stale = staleGuard(doc, change);
  if (stale !== null) return stale;

  const capability = doc.canPatch(change.operations);
  if (!capability.ok) return capabilityError(id, capability);

  return { ok: true, change: copyChange(change) };
}

export function canCloseChange(
  changes: ReadonlyMap<string, ProposedChange>,
  id: string,
): ProposedChangeResult {
  const change = changes.get(id);
  if (change === undefined) return notFound(id);
  if (change.status !== "open") return notOpen(id, change.status, "reject");
  return { ok: true, change: copyChange(change) };
}

function staleGuard<TDocument>(
  doc: JSONDocument<TDocument>,
  change: ProposedChange,
): ProposedChangeError | null {
  for (const guard of change.guards) {
    const read = doc.at(guard.path);
    if (!read.ok) {
      return proposedChangeError("stale_change", `proposed change guard path no longer exists: ${guard.path}`, {
        id: change.id,
        pointer: guard.path,
      });
    }
    if (JSON.stringify(read.value) !== JSON.stringify(guard.value)) {
      return proposedChangeError("stale_change", `proposed change guard changed: ${guard.path}`, {
        id: change.id,
        pointer: guard.path,
      });
    }
  }
  return null;
}
