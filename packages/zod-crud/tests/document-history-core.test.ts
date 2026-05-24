import { describe, expect, test } from "vitest";

import {
  buildChangeMetadata,
  compactHistoryMetadata,
  planDocumentActiveHistoryMetadata,
  planDocumentChangeCapture,
  planCompactedRepeatedReplaceHistory,
  planDocumentHistoryAppend,
  planDocumentHistoryEntry,
  planDocumentHistoryMergeLast,
  planDocumentHistoryMergeMetadata,
  planDocumentHistoryRestore,
  planDocumentTransactionAppendCompact,
  planDocumentTransactionCall,
  planDocumentTransactionMerge,
  planDocumentTransactionMergeRange,
  planDocumentTransactionScope,
  planMergedDocumentHistoryEntry,
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

  test("plans history recording and metadata capture from document change inputs", () => {
    expect(planDocumentChangeCapture({
      historyLimit: 10,
      isRestoring: false,
      operationCount: 1,
      activeHistoryMetadata: undefined,
      metadata: undefined,
      selectionEnabled: false,
      documentSubscriberCount: 0,
    })).toEqual({
      shouldRecordHistory: true,
      shouldCaptureMetadata: true,
    });

    expect(planDocumentChangeCapture({
      historyLimit: 10,
      isRestoring: true,
      operationCount: 1,
      activeHistoryMetadata: undefined,
      metadata: undefined,
      selectionEnabled: false,
      documentSubscriberCount: 0,
    })).toEqual({
      shouldRecordHistory: false,
      shouldCaptureMetadata: false,
    });

    expect(planDocumentChangeCapture({
      historyLimit: 0,
      isRestoring: false,
      operationCount: 0,
      activeHistoryMetadata: undefined,
      metadata: undefined,
      selectionEnabled: true,
      documentSubscriberCount: 1,
    })).toEqual({
      shouldRecordHistory: false,
      shouldCaptureMetadata: true,
    });
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

  test("plans merge metadata from previous, next, and explicit merge options", () => {
    expect(planDocumentHistoryMergeMetadata({
      previous: undefined,
      next: undefined,
    })).toBeUndefined();

    expect(planDocumentHistoryMergeMetadata({
      previous: { label: "Previous", origin: "keyboard", mergeKey: "prev" },
      next: { label: "Next" },
      options: { mergeKey: "explicit" },
    })).toEqual({
      label: "Next",
      origin: "keyboard",
      mergeKey: "explicit",
    });
  });

  test("plans mergeLast output with guard conditions", () => {
    const previous = {
      forward: [{ op: "replace", path: "/title", value: "a" }],
      inverse: [{ op: "replace", path: "/title", value: "draft" }],
      selectionBefore: emptySelection,
      selectionAfter: titleSelection,
      metadata: { label: "Previous", origin: "keyboard", mergeKey: "prev" },
    } satisfies NonNullable<ReturnType<typeof planDocumentHistoryEntry>>;
    const top = {
      forward: [{ op: "replace", path: "/count", value: 1 }],
      inverse: [{ op: "replace", path: "/count", value: 0 }],
      selectionBefore: titleSelection,
      selectionAfter: emptySelection,
      metadata: { label: "Top" },
    } satisfies NonNullable<ReturnType<typeof planDocumentHistoryEntry>>;

    expect(planDocumentHistoryMergeLast({
      isRestoring: true,
      historyDepth: 2,
      previous,
      top,
    })).toBeNull();
    expect(planDocumentHistoryMergeLast({
      isRestoring: false,
      historyDepth: 1,
      previous,
      top,
    })).toBeNull();
    expect(planDocumentHistoryMergeLast({
      isRestoring: false,
      historyDepth: 2,
      previous,
      top,
      options: { mergeKey: "explicit" },
    })).toEqual({
      forward: [
        { op: "replace", path: "/title", value: "a" },
        { op: "replace", path: "/count", value: 1 },
      ],
      inverse: [
        { op: "replace", path: "/count", value: 0 },
        { op: "replace", path: "/title", value: "draft" },
      ],
      selectionBefore: emptySelection,
      selectionAfter: emptySelection,
      metadata: {
        label: "Top",
        origin: "keyboard",
        mergeKey: "explicit",
      },
    });
  });

  test("plans active transaction metadata for nested history scopes", () => {
    expect(planDocumentActiveHistoryMetadata({
      active: undefined,
      next: undefined,
    })).toBeUndefined();
    expect(planDocumentActiveHistoryMetadata({
      active: { label: "Outer", origin: "keyboard", mergeKey: "outer" },
      next: undefined,
    })).toEqual({
      label: "Outer",
      origin: "keyboard",
      mergeKey: "outer",
    });
    expect(planDocumentActiveHistoryMetadata({
      active: { label: "Outer", origin: "keyboard", mergeKey: "outer" },
      next: { label: "Inner", mergeKey: "inner" },
    })).toEqual({
      label: "Inner",
      origin: "keyboard",
      mergeKey: "inner",
    });
  });

  test("plans transaction scope depth for root and nested transactions", () => {
    expect(planDocumentTransactionScope({
      activeTransactionStartDepth: undefined,
      depthBefore: 3,
    })).toEqual({
      activeTransactionStartDepth: 3,
      restoreTransactionStartDepth: undefined,
    });

    expect(planDocumentTransactionScope({
      activeTransactionStartDepth: 1,
      depthBefore: 3,
    })).toEqual({
      activeTransactionStartDepth: 1,
      restoreTransactionStartDepth: 1,
    });
  });

  test("plans transaction call overload parsing without a document shell", () => {
    const fn = () => undefined;
    const metadata = { label: "Batch", origin: "keyboard", mergeKey: "batch" };

    expect(planDocumentTransactionCall({
      optionsOrFn: fn,
      maybeFn: undefined,
    })).toEqual({
      kind: "run",
      metadata: undefined,
      fn,
    });

    expect(planDocumentTransactionCall({
      optionsOrFn: metadata,
      maybeFn: fn,
    })).toEqual({
      kind: "run",
      metadata,
      fn,
    });

    expect(planDocumentTransactionCall({
      optionsOrFn: metadata,
      maybeFn: undefined,
    })).toEqual({ kind: "skip" });
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

  test("plans compact merged replace history without mutating source entries", () => {
    const prev = {
      forward: [{ op: "replace", path: "/title", value: "a" }],
      inverse: [{ op: "replace", path: "/title", value: "draft" }],
      selectionBefore: emptySelection,
      selectionAfter: titleSelection,
      metadata: { mergeKey: "typing:title" },
      snapshot: { before: { title: "draft" } },
    } satisfies NonNullable<ReturnType<typeof planDocumentHistoryEntry>>;
    const top = {
      forward: [{ op: "replace", path: "/title", value: "ab" }],
      inverse: [{ op: "replace", path: "/title", value: "a" }],
      selectionBefore: titleSelection,
      selectionAfter: emptySelection,
      metadata: { label: "Rename" },
    } satisfies NonNullable<ReturnType<typeof planDocumentHistoryEntry>>;

    expect(planCompactedRepeatedReplaceHistory(prev, top, {
      label: "Rename",
      mergeKey: "typing:title",
    })).toEqual({
      forward: [{ op: "replace", path: "/title", value: "ab" }],
      inverse: [{ op: "replace", path: "/title", value: "draft" }],
      selectionBefore: emptySelection,
      selectionAfter: emptySelection,
      metadata: { label: "Rename", mergeKey: "typing:title" },
      snapshot: { before: { title: "draft" } },
    });
    expect(prev.forward).toEqual([{ op: "replace", path: "/title", value: "a" }]);
    expect(top.forward).toEqual([{ op: "replace", path: "/title", value: "ab" }]);
  });

  test("plans general merged history order without a document shell", () => {
    const prev = {
      forward: [{ op: "replace", path: "/title", value: "a" }],
      inverse: [{ op: "replace", path: "/title", value: "draft" }],
      selectionBefore: emptySelection,
      selectionAfter: titleSelection,
    } satisfies NonNullable<ReturnType<typeof planDocumentHistoryEntry>>;
    const top = {
      forward: [{ op: "replace", path: "/count", value: 1 }],
      inverse: [{ op: "replace", path: "/count", value: 0 }],
      selectionBefore: titleSelection,
      selectionAfter: emptySelection,
    } satisfies NonNullable<ReturnType<typeof planDocumentHistoryEntry>>;

    expect(planMergedDocumentHistoryEntry(prev, top, { label: "Batch" })).toEqual({
      forward: [
        { op: "replace", path: "/title", value: "a" },
        { op: "replace", path: "/count", value: 1 },
      ],
      inverse: [
        { op: "replace", path: "/count", value: 0 },
        { op: "replace", path: "/title", value: "draft" },
      ],
      selectionBefore: emptySelection,
      selectionAfter: emptySelection,
      metadata: { label: "Batch" },
    });
    expect(prev.inverse).toEqual([{ op: "replace", path: "/title", value: "draft" }]);
    expect(top.inverse).toEqual([{ op: "replace", path: "/count", value: 0 }]);
  });

  test("plans compact repeated replace transaction entries without mutating source entries", () => {
    const entries = [
      {
        forward: [{ op: "replace", path: "/title", value: "a" }],
        inverse: [{ op: "replace", path: "/title", value: "draft" }],
        selectionBefore: emptySelection,
        selectionAfter: titleSelection,
        metadata: { label: "Typing" },
        snapshot: { before: { title: "draft" } },
      },
      {
        forward: [{ op: "replace", path: "/title", value: "ab" }],
        inverse: [{ op: "replace", path: "/title", value: "a" }],
        selectionBefore: titleSelection,
        selectionAfter: titleSelection,
        metadata: { mergeKey: "typing:title" },
      },
      {
        forward: [{ op: "replace", path: "/title", value: "abc" }],
        inverse: [{ op: "replace", path: "/title", value: "ab" }],
        selectionBefore: titleSelection,
        selectionAfter: emptySelection,
      },
    ] satisfies Array<NonNullable<ReturnType<typeof planDocumentHistoryEntry>>>;

    expect(planDocumentTransactionMerge({ entries, start: 0, end: entries.length })).toEqual({
      forward: [{ op: "replace", path: "/title", value: "abc" }],
      inverse: [{ op: "replace", path: "/title", value: "draft" }],
      selectionBefore: emptySelection,
      selectionAfter: emptySelection,
      metadata: { label: "Typing", mergeKey: "typing:title" },
      snapshot: { before: { title: "draft" } },
    });
    expect(entries[0]?.forward).toEqual([{ op: "replace", path: "/title", value: "a" }]);
    expect(entries[0]?.selectionAfter).toBe(titleSelection);
  });

  test("plans compact append into an active repeated replace transaction", () => {
    const previous = {
      forward: [{ op: "replace", path: "/title", value: "a" }],
      inverse: [{ op: "replace", path: "/title", value: "draft" }],
      selectionBefore: emptySelection,
      selectionAfter: titleSelection,
      metadata: { label: "Typing" },
      snapshot: { before: { title: "draft" } },
    } satisfies NonNullable<ReturnType<typeof planDocumentHistoryEntry>>;

    expect(planDocumentTransactionAppendCompact({
      previous,
      operations: [{ op: "replace", path: "/title", value: "ab" }],
      selectionAfter: emptySelection,
      metadata: { mergeKey: "typing:title" },
    })).toEqual({
      forward: [{ op: "replace", path: "/title", value: "ab" }],
      inverse: [{ op: "replace", path: "/title", value: "draft" }],
      selectionBefore: emptySelection,
      selectionAfter: emptySelection,
      metadata: { label: "Typing", mergeKey: "typing:title" },
      snapshot: { before: { title: "draft" } },
    });
    expect(previous.forward).toEqual([{ op: "replace", path: "/title", value: "a" }]);
    expect(planDocumentTransactionAppendCompact({
      previous,
      operations: [{ op: "replace", path: "/other", value: "x" }],
      selectionAfter: emptySelection,
      metadata: undefined,
    })).toBeNull();
  });

  test("plans history append actions after an entry has been built", () => {
    const previous = {
      forward: [{ op: "replace", path: "/title", value: "a" }],
      inverse: [{ op: "replace", path: "/title", value: "draft" }],
      selectionBefore: emptySelection,
      selectionAfter: titleSelection,
      metadata: { label: "Typing" },
      snapshot: { before: { title: "draft" } },
    } satisfies NonNullable<ReturnType<typeof planDocumentHistoryEntry>>;
    const entry = {
      forward: [{ op: "replace", path: "/title", value: "ab" }],
      inverse: [{ op: "replace", path: "/title", value: "a" }],
      selectionBefore: titleSelection,
      selectionAfter: emptySelection,
      metadata: { mergeKey: "typing:title" },
    } satisfies NonNullable<ReturnType<typeof planDocumentHistoryEntry>>;

    expect(planDocumentHistoryAppend({
      activeTransactionStartDepth: undefined,
      currentDepth: 1,
      previous,
      entry,
    })).toEqual({ kind: "commit", entry });

    expect(planDocumentHistoryAppend({
      activeTransactionStartDepth: 0,
      currentDepth: 1,
      previous,
      entry,
    })).toEqual({
      kind: "replaceLast",
      entry: {
        forward: [{ op: "replace", path: "/title", value: "ab" }],
        inverse: [{ op: "replace", path: "/title", value: "draft" }],
        selectionBefore: emptySelection,
        selectionAfter: emptySelection,
        metadata: { label: "Typing", mergeKey: "typing:title" },
        snapshot: { before: { title: "draft" } },
      },
    });

    expect(planDocumentHistoryAppend({
      activeTransactionStartDepth: 0,
      currentDepth: 1,
      previous,
      entry: null,
    })).toEqual({ kind: "skip" });
    expect(previous.forward).toEqual([{ op: "replace", path: "/title", value: "a" }]);
  });

  test("plans general transaction merge for a selected entry range", () => {
    const prefix = {
      forward: [{ op: "replace", path: "/skip", value: 1 }],
      inverse: [{ op: "replace", path: "/skip", value: 0 }],
      selectionBefore: emptySelection,
      selectionAfter: emptySelection,
    } satisfies NonNullable<ReturnType<typeof planDocumentHistoryEntry>>;
    const first = {
      forward: [{ op: "replace", path: "/title", value: "a" }],
      inverse: [{ op: "replace", path: "/title", value: "draft" }],
      selectionBefore: emptySelection,
      selectionAfter: titleSelection,
      metadata: { label: "A", origin: "keyboard" },
    } satisfies NonNullable<ReturnType<typeof planDocumentHistoryEntry>>;
    const second = {
      forward: [{ op: "replace", path: "/count", value: 1 }],
      inverse: [{ op: "replace", path: "/count", value: 0 }],
      selectionBefore: titleSelection,
      selectionAfter: emptySelection,
      metadata: { label: "B", mergeKey: "batch" },
    } satisfies NonNullable<ReturnType<typeof planDocumentHistoryEntry>>;
    const entries = [prefix, first, second];

    expect(planDocumentTransactionMerge({ entries, start: 1, end: 3 })).toEqual({
      forward: [
        { op: "replace", path: "/title", value: "a" },
        { op: "replace", path: "/count", value: 1 },
      ],
      inverse: [
        { op: "replace", path: "/count", value: 0 },
        { op: "replace", path: "/title", value: "draft" },
      ],
      selectionBefore: emptySelection,
      selectionAfter: emptySelection,
      metadata: { label: "B", origin: "keyboard", mergeKey: "batch" },
    });
    expect(planDocumentTransactionMerge({ entries, start: 2, end: 2 })).toBeNull();
  });

  test("plans transaction merge ranges from mutable history counters", () => {
    expect(planDocumentTransactionMergeRange({
      undoStart: 3,
      undoLength: 7,
      depthBefore: 1,
      currentDepth: 4,
    })).toEqual({ start: 4, end: 7 });

    expect(planDocumentTransactionMergeRange({
      undoStart: 3,
      undoLength: 5,
      depthBefore: 1,
      currentDepth: 2,
    })).toBeNull();

    expect(planDocumentTransactionMergeRange({
      undoStart: 3,
      undoLength: 4,
      depthBefore: -1,
      currentDepth: 4,
    })).toBeNull();
  });

  test("plans undo restore patches, snapshot state, and redo selection without mutating the entry", () => {
    const entry = {
      forward: [{ op: "replace", path: "/title", value: "final" }],
      inverse: [{ op: "replace", path: "/title", value: "draft" }],
      selectionBefore: emptySelection,
      selectionAfter: titleSelection,
      snapshot: { before: { title: "draft" } },
    } satisfies NonNullable<ReturnType<typeof planDocumentHistoryEntry>>;
    const currentSelection: SelectionSnap = {
      selectedPointers: ["/count"],
      selectionRanges: [{ anchor: "/count", focus: "/count" }],
      primaryIndex: 0,
      anchor: "/count",
      focus: "/count",
    };

    expect(planDocumentHistoryRestore({
      direction: "undo",
      entry,
      currentState: { title: "final" },
      currentSelection,
    })).toEqual({
      patch: [{ op: "replace", path: "/title", value: "draft" }],
      state: { title: "draft" },
      selectionAfter: emptySelection,
      entry: {
        forward: [{ op: "replace", path: "/title", value: "final" }],
        inverse: [{ op: "replace", path: "/title", value: "draft" }],
        selectionBefore: emptySelection,
        selectionAfter: currentSelection,
        snapshot: {
          before: { title: "draft" },
          after: { title: "final" },
        },
      },
    });
    expect(entry.selectionAfter).toBe(titleSelection);
    expect(entry.snapshot).toEqual({ before: { title: "draft" } });
  });

  test("plans redo restore patches and clears transient snapshot-after on the next entry", () => {
    const entry = {
      forward: [{ op: "replace", path: "/title", value: "final" }],
      inverse: [{ op: "replace", path: "/title", value: "draft" }],
      selectionBefore: emptySelection,
      selectionAfter: titleSelection,
      metadata: { label: "Redo title" },
      snapshot: {
        before: { title: "draft" },
        after: { title: "final" },
      },
    } satisfies NonNullable<ReturnType<typeof planDocumentHistoryEntry>>;

    expect(planDocumentHistoryRestore({
      direction: "redo",
      entry,
      currentState: { title: "draft" },
      currentSelection: emptySelection,
    })).toEqual({
      patch: [{ op: "replace", path: "/title", value: "final" }],
      state: { title: "final" },
      selectionAfter: titleSelection,
      entry: {
        forward: [{ op: "replace", path: "/title", value: "final" }],
        inverse: [{ op: "replace", path: "/title", value: "draft" }],
        selectionBefore: emptySelection,
        selectionAfter: titleSelection,
        metadata: { label: "Redo title" },
        snapshot: { before: { title: "draft" } },
      },
    });
    expect(entry.snapshot).toEqual({
      before: { title: "draft" },
      after: { title: "final" },
    });
  });
});
