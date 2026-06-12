const objectHasOwn = Object.prototype.hasOwnProperty;

export function cloneTrustedPlainJson<T>(value: T): T {
  return cloneTrustedPlainJsonFast(value);
}

function cloneTrustedPlainJsonFast<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  const checkOwnProperties = objectPrototypeHasEnumerableKeys();
  return (Array.isArray(value)
    ? cloneTrustedPlainArray(value, checkOwnProperties)
    : cloneTrustedPlainObject(value as Record<string, unknown>, checkOwnProperties)) as T;
}

function objectPrototypeHasEnumerableKeys(): boolean {
  for (const _key in Object.prototype) return true;
  return false;
}

function cloneTrustedPlainArray(value: unknown[], checkOwnProperties: boolean): unknown[] {
  if (value.length === 0) return [];

  const first = value[0];
  if (first === null || typeof first !== "object") {
    let hasObject = false;
    for (let index = 1; index < value.length; index += 1) {
      const child = value[index];
      if (child !== null && typeof child === "object") {
        hasObject = true;
        break;
      }
    }
    if (!hasObject) return value.slice();
  }

  const next = new Array(value.length);
  for (let index = 0; index < value.length; index += 1) {
    const child = value[index];
    next[index] = child === null || typeof child !== "object"
      ? child
      : Array.isArray(child)
        ? cloneTrustedPlainArray(child, checkOwnProperties)
        : cloneTrustedPlainObject(child as Record<string, unknown>, checkOwnProperties);
  }
  return next;
}

function cloneTrustedPlainObject(
  source: Record<string, unknown>,
  checkOwnProperties: boolean,
): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const key in source) {
    if (checkOwnProperties && !objectHasOwn.call(source, key)) continue;
    const child = source[key];
    const cloned = child === null || typeof child !== "object"
      ? child
      : Array.isArray(child)
        ? cloneTrustedPlainArray(child, checkOwnProperties)
        : cloneTrustedPlainObject(child as Record<string, unknown>, checkOwnProperties);
    if (key === "__proto__") {
      Object.defineProperty(next, key, {
        value: cloned,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    } else {
      next[key] = cloned;
    }
  }
  return next;
}
