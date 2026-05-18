// Internal JSON boundary helpers. Public state/actions must stay plain JSON.

export function jsonSerializableError(value: unknown): string | null {
  const seen = new WeakSet<object>();

  const visit = (v: unknown, path: string): string | null => {
    if (v === null) return null;
    const t = typeof v;
    if (t === "string" || t === "boolean") return null;
    if (t === "number") return Number.isFinite(v) ? null : `${path}: non-finite number`;
    if (t === "undefined" || t === "function" || t === "symbol" || t === "bigint") {
      return `${path}: ${t} is not JSON`;
    }
    if (t !== "object") return null;

    const obj = v as object;
    if (seen.has(obj)) return `${path}: circular reference`;
    seen.add(obj);

    if (Array.isArray(v)) {
      for (let i = 0; i < v.length; i++) {
        if (!Object.prototype.hasOwnProperty.call(v, i)) return `${path}/${i}: sparse array hole`;
        const err = visit(v[i], `${path}/${i}`);
        if (err) return err;
      }
      return null;
    }

    const proto = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null) {
      const name = proto?.constructor?.name ?? "unknown";
      return `${path}: non-plain object (${name})`;
    }

    if (Object.getOwnPropertySymbols(v).length > 0) return `${path}: symbol keys are not JSON`;

    for (const key of Object.getOwnPropertyNames(v)) {
      const descriptor = Object.getOwnPropertyDescriptor(v, key);
      if (!descriptor) continue;
      const childPath = path === "" ? `/${key}` : `${path}/${key}`;
      if (!descriptor.enumerable) return `${childPath}: non-enumerable property is not JSON`;
      if ("get" in descriptor || "set" in descriptor) return `${childPath}: accessor property is not JSON`;
    }

    for (const key of Object.keys(v as Record<string, unknown>)) {
      const err = visit((v as Record<string, unknown>)[key], path === "" ? `/${key}` : `${path}/${key}`);
      if (err) return err;
    }
    return null;
  };

  return visit(value, "");
}

export function assertJsonSerializable(value: unknown): void {
  const reason = jsonSerializableError(value);
  if (reason !== null) throw new TypeError(`Value is not JSON-serializable: ${reason}`);
}

export function cloneJson<T>(value: T): T {
  assertJsonSerializable(value);
  return JSON.parse(JSON.stringify(value)) as T;
}
