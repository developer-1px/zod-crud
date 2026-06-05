import {
  persistenceError,
} from "./errors.js";
import type {
  DocumentPersistenceError,
  DocumentPersistenceHost,
  MaybePromise,
} from "./types.js";

export function resolveReadHost(host?: DocumentPersistenceHost): { ok: true; read: (key: string) => MaybePromise<string | null | undefined> } | DocumentPersistenceError {
  const resolved = host ?? getLocalStorageHost();
  if (typeof resolved?.read === "function") return { ok: true, read: resolved.read.bind(resolved) };
  if (typeof resolved?.getItem === "function") return { ok: true, read: resolved.getItem.bind(resolved) };
  return persistenceError("persistence_unavailable", "document persistence read is unavailable");
}

export function resolveWriteHost(host?: DocumentPersistenceHost): { ok: true; write: (key: string, value: string) => MaybePromise<void> } | DocumentPersistenceError {
  const resolved = host ?? getLocalStorageHost();
  if (typeof resolved?.write === "function") return { ok: true, write: resolved.write.bind(resolved) };
  if (typeof resolved?.setItem === "function") return { ok: true, write: resolved.setItem.bind(resolved) };
  return persistenceError("persistence_unavailable", "document persistence write is unavailable");
}

export function resolveRemoveHost(host?: DocumentPersistenceHost): { ok: true; remove: (key: string) => MaybePromise<void> } | DocumentPersistenceError {
  const resolved = host ?? getLocalStorageHost();
  if (typeof resolved?.remove === "function") return { ok: true, remove: resolved.remove.bind(resolved) };
  if (typeof resolved?.removeItem === "function") return { ok: true, remove: resolved.removeItem.bind(resolved) };
  return persistenceError("persistence_unavailable", "document persistence remove is unavailable");
}

function getLocalStorageHost(): DocumentPersistenceHost | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}
