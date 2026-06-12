import { objectHasOwn } from "../../../foundation/patch/object.js";

export {
  copyRootObject as copyRootRecord,
  copyRootObjectKeyPrefix as copyRootRecordKeyPrefix,
  copyRootObjectKeys as copyRootRecordKeys,
  objectHasOwn,
  removedRootKeysMatchSuffix,
} from "../../../foundation/patch/object.js";

export function writeObjectDataValue(target: Record<string, unknown>, key: string, value: unknown): void {
  if (key === "__proto__") {
    Object.defineProperty(target, key, {
      value,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  } else {
    target[key] = value;
  }
}

export function replaceObjectDataValue(current: unknown, key: string, value: unknown): Record<string, unknown> | null {
  if (current === null || typeof current !== "object" || Array.isArray(current)) return null;
  if (!objectHasOwn.call(current, key)) return null;

  const next = { ...(current as Record<string, unknown>) };
  writeObjectDataValue(next, key, value);
  return next;
}

export function createDataKeySet(keys: ReadonlyArray<string>): Record<string, true> {
  const keySet = Object.create(null) as Record<string, true>;
  for (const key of keys) keySet[key] = true;
  return keySet;
}
