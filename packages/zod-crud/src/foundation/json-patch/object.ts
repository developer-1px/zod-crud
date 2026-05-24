export const objectHasOwn = Object.prototype.hasOwnProperty;

export function copyRootObject(source: Record<string, unknown>): Record<string, unknown> {
  return copyRootObjectKeys(source, Object.keys(source));
}

export function copyRootObjectKeys(
  source: Record<string, unknown>,
  keys: ReadonlyArray<string>,
): Record<string, unknown> {
  return copyRootObjectKeyPrefix(source, keys, keys.length);
}

export function copyRootObjectKeyPrefix(
  source: Record<string, unknown>,
  keys: ReadonlyArray<string>,
  end: number,
): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  if (!objectHasOwn.call(source, "__proto__")) {
    for (let index = 0; index < end; index += 1) {
      const key = keys[index]!;
      next[key] = source[key];
    }
    return next;
  }

  for (let index = 0; index < end; index += 1) {
    const key = keys[index]!;
    if (key !== "__proto__") {
      next[key] = source[key];
      continue;
    }
    Object.defineProperty(next, key, {
      value: source[key],
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return next;
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
