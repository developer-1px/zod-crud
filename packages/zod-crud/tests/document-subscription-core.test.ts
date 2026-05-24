import { describe, expect, test } from "vitest";

import { planDocumentSubscriptionChange } from "../src/application/document/createJSONDocument.js";

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
});
