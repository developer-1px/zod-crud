export const objectHasOwn = Object.prototype.hasOwnProperty;

export function copyRootRecord(source: Record<string, unknown>): Record<string, unknown> {
  return copyRootRecordKeys(source, Object.keys(source));
}

export function copyRootRecordKeys(
  source: Record<string, unknown>,
  keys: ReadonlyArray<string>,
): Record<string, unknown> {
  return copyRootRecordKeyPrefix(source, keys, keys.length);
}

export function copyRootRecordKeyPrefix(
  source: Record<string, unknown>,
  keys: ReadonlyArray<string>,
  end: number,
): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (let index = 0; index < end; index += 1) {
    const key = keys[index]!;
    writeObjectDataValue(next, key, source[key]);
  }
  return next;
}

export function writeRootRecordValue(target: Record<string, unknown>, key: string, value: unknown): void {
  writeObjectDataValue(target, key, value);
}

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

export function removedRootKeysMatchSuffix(
  keys: ReadonlyArray<string>,
  keepCount: number,
  removedKeys: Record<string, true>,
): boolean {
  for (let index = keepCount; index < keys.length; index += 1) {
    if (!objectHasOwn.call(removedKeys, keys[index]!)) return false;
  }
  return true;
}
