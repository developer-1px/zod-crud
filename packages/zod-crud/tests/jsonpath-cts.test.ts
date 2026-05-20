// RFC 9535 JSONPath Compliance Test Suite vendor.
// Source: https://github.com/jsonpath-standard/jsonpath-compliance-test-suite

import { describe, expect, test } from "vitest";

import cts from "./conformance/jsonpath-cts.json" with { type: "json" };
import { queryMatches } from "../src/core/jsonpath/index.js";

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
const MIN_PASSING_CASES = 522;

const suite = cts as { tests: JsonPathCtsCase[] };

describe("RFC 9535 JSONPath CTS — jsonpath-standard vendor", () => {
  test("current conformance floor does not regress", () => {
    const failures: Failure[] = [];
    let invalidSelectors = 0;
    let passed = 0;

    for (const c of suite.tests) {
      try {
        const result = queryMatches(c.selector, c.document).map((match) => match.value);
        if (c.invalid_selector) {
          invalidSelectors += 1;
          failures.push(failure(c, "expected invalid selector"));
          continue;
        }

        if (matchesAllowedResult(result, c)) {
          passed += 1;
        } else {
          failures.push(failure(c, "result mismatch"));
        }
      } catch (error) {
        if (c.invalid_selector) {
          invalidSelectors += 1;
          passed += 1;
        } else {
          failures.push(failure(c, error instanceof Error ? error.message : "unexpected throw"));
        }
      }
    }

    expect(suite.tests).toHaveLength(EXPECTED_TOTAL);
    expect(invalidSelectors).toBe(EXPECTED_INVALID_SELECTORS);
    expect(passed, JSON.stringify(failures.slice(0, 20), null, 2)).toBeGreaterThanOrEqual(MIN_PASSING_CASES);
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
