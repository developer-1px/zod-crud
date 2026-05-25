import { describe, expect, test } from "vitest";

import {
  planDocumentSubscriptionChange,
  planDocumentSubscriptionMetadata,
} from "../../../src/application/document/createJSONDocumentChangePlan.js";
import type { SelectionSnap } from "../../../src/domain/selection/selectionTypes.js";

const emptySelection: SelectionSnap = {
  selectedPointers: [],
  selectionRanges: [],
  primaryIndex: -1,
  anchor: null,
  focus: null,
};

const titleSelection: SelectionSnap = {
  selectedPointers: ["/title"],
  selectionRanges: [{ anchor: "/title", focus: "/title" }],
  primaryIndex: 0,
  anchor: "/title",
  focus: "/title",
};

describe("document subscription core functions", () => {
  test("plans subscription count increment without touching the document shell", () => {
    expect(planDocumentSubscriptionChange({
      event: "subscribe",
      subscriberCount: 0,
      subscribed: false,
    })).toEqual({
      subscriberCount: 1,
      subscribed: true,
      shouldCallUnderlyingUnsubscribe: false,
    });
  });

  test("plans idempotent unsubscribe and underlying cleanup", () => {
    const first = planDocumentSubscriptionChange({
      event: "unsubscribe",
      subscriberCount: 1,
      subscribed: true,
    });

    expect(first).toEqual({
      subscriberCount: 0,
      subscribed: false,
      shouldCallUnderlyingUnsubscribe: true,
    });
    expect(planDocumentSubscriptionChange({
      event: "unsubscribe",
      subscriberCount: first.subscriberCount,
      subscribed: first.subscribed,
    })).toEqual({
      subscriberCount: 0,
      subscribed: false,
      shouldCallUnderlyingUnsubscribe: false,
    });
  });

  test("does not let defensive unsubscribe planning produce a negative count", () => {
    expect(planDocumentSubscriptionChange({
      event: "unsubscribe",
      subscriberCount: 0,
      subscribed: true,
    })).toEqual({
      subscriberCount: 0,
      subscribed: false,
      shouldCallUnderlyingUnsubscribe: true,
    });
  });

  test("plans subscriber metadata with a final selection fallback", () => {
    expect(planDocumentSubscriptionMetadata({
      metadata: undefined,
      selectionAfter: titleSelection,
    })).toEqual({
      selectionAfter: titleSelection,
    });

    expect(planDocumentSubscriptionMetadata({
      metadata: { label: "Rename" },
      selectionAfter: titleSelection,
    })).toEqual({
      label: "Rename",
      selectionAfter: titleSelection,
    });

    expect(planDocumentSubscriptionMetadata({
      metadata: {
        label: "Rename",
        selectionAfter: emptySelection,
      },
      selectionAfter: titleSelection,
    })).toEqual({
      label: "Rename",
      selectionAfter: emptySelection,
    });
  });
});
