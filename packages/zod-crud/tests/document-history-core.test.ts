import { describe, expect, test } from "vitest";

import {
  buildChangeMetadata,
  compactHistoryMetadata,
  planDocumentHistoryEntry,
  shouldCaptureDocumentChangeMetadata,
} from "../src/application/document/createJSONDocument.js";
import type { JSONPatchOperation } from "../src/foundation/json-patch/index.js";
import type { SelectionSnap } from "../src/domain/selection/index.js";

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

describe("document history core functions", () => {
  test("decides when change metadata must be captured without a document shell", () => {
    expect(shouldCaptureDocumentChangeMetadata({
      shouldRecordHistory: false,
      activeHistoryMetadata: undefined,
      metadata: undefined,
      selectionEnabled: false,
      documentSubscriberCount: 0,
    })).toBe(false);

    expect(shouldCaptureDocumentChangeMetadata({
      shouldRecordHistory: true,
      activeHistoryMetadata: undefined,
      metadata: undefined,
      selectionEnabled: false,
      documentSubscriberCount: 0,
    })).toBe(true);

    expect(shouldCaptureDocumentChangeMetadata({
      shouldRecordHistory: false,
      activeHistoryMetadata: undefined,
      metadata: undefined,
      selectionEnabled: true,
      documentSubscriberCount: 1,
    })).toBe(true);
  });

  test("builds subscriber metadata from active metadata, direct metadata, and selection", () => {
    expect(buildChangeMetadata(undefined, undefined, titleSelection, false)).toBeUndefined();

    expect(buildChangeMetadata(
      { label: "transaction", origin: "keyboard", mergeKey: "title" },
      { label: "direct", selectionAfter: emptySelection },
      titleSelection,
      true,
    )).toMatchObject({
      label: "direct",
      origin: "keyboard",
      mergeKey: "title",
      selectionBefore: { selectedPointers: ["/title"] },
      selectionAfter: { selectedPointers: [] },
    });
  });

  test("keeps history metadata compact and separate from selection metadata", () => {
    expect(compactHistoryMetadata(undefined)).toBeUndefined();
    expect(compactHistoryMetadata({})).toBeUndefined();
    expect(compactHistoryMetadata({
      label: "Rename",
      origin: "keyboard",
      mergeKey: "typing:title",
    })).toEqual({
      label: "Rename",
      origin: "keyboard",
      mergeKey: "typing:title",
    });
  });

  test("plans compact history entries for repeated replace batches", () => {
    const operations: JSONPatchOperation[] = [
      { op: "replace", path: "/title", value: "a" },
      { op: "replace", path: "/title", value: "ab" },
      { op: "replace", path: "/title", value: "abc" },
    ];

    const entry = planDocumentHistoryEntry({
      before: { title: "draft" },
      after: { title: "abc" },
      operations,
      selectionBefore: titleSelection,
      selectionAfter: titleSelection,
      metadata: { mergeKey: "typing:title" },
    });

    expect(entry).toMatchObject({
      forward: [{ op: "replace", path: "/title", value: "abc" }],
      inverse: [{ op: "replace", path: "/title", value: "draft" }],
      selectionBefore: { selectedPointers: ["/title"] },
      selectionAfter: { selectedPointers: ["/title"] },
      metadata: { mergeKey: "typing:title" },
    });
  });

  test("returns null when inverse planning cannot prove a history entry", () => {
    expect(planDocumentHistoryEntry({
      before: { title: "draft" },
      after: { title: "draft" },
      operations: [{ op: "remove", path: "/missing" }],
      selectionBefore: emptySelection,
      selectionAfter: emptySelection,
    })).toBeNull();
  });

  test("plans root bulk history snapshots without applying a document shell", () => {
    const before = Object.fromEntries(
      Array.from({ length: 512 }, (_, index) => [`k${index}`, index]),
    );
    const operations: JSONPatchOperation[] = Object.keys(before).map((key) => ({
      op: "remove",
      path: `/${key}`,
    }));
    const entry = planDocumentHistoryEntry({
      before,
      after: {},
      operations,
      selectionBefore: emptySelection,
      selectionAfter: emptySelection,
    });

    expect(entry?.snapshot).toEqual({ before });
    expect(entry?.forward).toHaveLength(512);
    expect(entry?.inverse).toHaveLength(512);
  });
});
