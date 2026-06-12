// RFC 9535 JSONPath Compliance Test Suite vendor.
// Source: https://github.com/jsonpath-standard/jsonpath-compliance-test-suite

import { describe, expect, test } from "vitest";
import * as z from "zod";

import cts from "./conformance/jsonpath-cts.json" with { type: "json" };
import { createJSONDocument } from "@interactive-os/json-document";

interface JsonPathCtsCase {
  name: string;
  selector: string;
  document?: unknown;
  result?: unknown[];
  results?: unknown[][];
  invalid_selector?: boolean;
  tags?: string[];
}

interface Failure {
  name: string;
  selector: string;
  reason: string;
  tags?: string[];
}

const EXPECTED_TOTAL = 703;
const EXPECTED_INVALID_SELECTORS = 247;
const EXPECTED_PASSING_CASES = EXPECTED_TOTAL;

const suite = cts as { tests: JsonPathCtsCase[] };
const Any = z.unknown();

describe("RFC 9535 JSONPath CTS — jsonpath-standard vendor", () => {
  test("full conformance does not regress", () => {
    const failures: Failure[] = [];
    let invalidSelectors = 0;
    let passed = 0;

    for (const c of suite.tests) {
      const doc = createJSONDocument(Any, c.document);
      const queried = doc.query(c.selector);
      if (c.invalid_selector) {
        invalidSelectors += 1;
        if (!queried.ok) {
          passed += 1;
        } else {
          failures.push(failure(c, "expected invalid selector"));
        }
        continue;
      }

      if (!queried.ok) {
        failures.push(failure(c, queried.reason ?? "invalid query"));
        continue;
      }

      const result = queried.pointers.map((pointer) => {
        const read = doc.at(pointer);
        if (!read.ok) throw new Error(`query returned unreadable pointer: ${pointer}`);
        return read.value;
      });
      if (matchesAllowedResult(result, c)) {
        passed += 1;
      } else {
        failures.push(failure(c, "result mismatch"));
      }
    }

    expect(suite.tests).toHaveLength(EXPECTED_TOTAL);
    expect(invalidSelectors).toBe(EXPECTED_INVALID_SELECTORS);
    expect(passed, JSON.stringify(failures.slice(0, 20), null, 2)).toBe(EXPECTED_PASSING_CASES);
  });
});

function matchesAllowedResult(actual: unknown[], c: JsonPathCtsCase): boolean {
  const allowed = "result" in c ? [c.result ?? []] : c.results ?? [];
  return allowed.some((expected) => sameJSON(actual, expected));
}

function failure(c: JsonPathCtsCase, reason: string): Failure {
  const out: Failure = { name: c.name, selector: c.selector, reason };
  if (c.tags !== undefined) out.tags = c.tags;
  return out;
}

function sameJSON(left: unknown, right: unknown): boolean {
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

function canonical(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(canonical);
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    out[key] = canonical((value as Record<string, unknown>)[key]);
  }
  return out;
}
