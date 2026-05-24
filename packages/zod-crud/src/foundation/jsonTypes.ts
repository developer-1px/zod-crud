type JSONPrimitive = string | number | boolean | null;

export type JSONValue =
  | JSONPrimitive
  | { readonly [key: string]: JSONValue }
  | ReadonlyArray<JSONValue>;

export type CloneJsonResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: string };
