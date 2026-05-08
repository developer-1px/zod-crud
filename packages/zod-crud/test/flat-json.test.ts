import { describe, expect, it } from "vitest";

import {
  deserialize,
  serialize,
  type JsonDoc,
  type JsonValue,
} from "../src/index.js";

describe("flat JSON model", () => {
  it("round-trips nested JSON through a flat node table", () => {
    const value = {
      kind: "frame",
      children: [{ kind: "text", text: "hello" }],
    };

    const doc = serialize(value);

    expect(doc.rootId).toBe("n1");
    expect(Object.values(doc.nodes).map((node) => node.parentId)).toContain("n1");
    expect(deserialize(doc)).toEqual(value);
  });

  it("rejects duplicate object keys in malformed flat docs", () => {
    const doc: JsonDoc = {
      rootId: "n1",
      nodes: {
        n1: { id: "n1", type: "object", parentId: null, key: null, children: ["n2", "n3"] },
        n2: { id: "n2", type: "string", parentId: "n1", key: "name", children: [], value: "first" },
        n3: { id: "n3", type: "string", parentId: "n1", key: "name", children: [], value: "second" },
      },
    };

    expect(() => deserialize(doc)).toThrow("duplicate key");
  });

  it("round-trips __proto__ as an own JSON key", () => {
    const value = JSON.parse('{"__proto__":{"polluted":true},"safe":1}') as JsonValue;
    const roundTrip = deserialize(serialize(value)) as Record<string, JsonValue>;

    expect(Object.prototype.hasOwnProperty.call(roundTrip, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(roundTrip)).toBe(Object.prototype);
  });
});
