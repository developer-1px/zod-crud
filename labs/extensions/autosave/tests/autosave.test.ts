import { describe, expect, test } from "vitest";
import * as z from "zod";

import { createJSONDocument } from "@interactive-os/json-document";
import {
  createAutoSave,
  type AutoSaveScheduler,
} from "../src/index.js";

const Schema = z.object({
  title: z.string(),
  cards: z.array(z.object({
    id: z.string(),
    title: z.string(),
  })),
});

function createDoc() {
  return createJSONDocument(Schema, {
    title: "Draft",
    cards: [
      { id: "a", title: "A" },
    ],
  });
}

function createManualScheduler() {
  const tasks: Array<() => void> = [];
  const scheduler: AutoSaveScheduler = {
    schedule(task) {
      tasks.push(task);
      let active = true;
      return () => {
        active = false;
      };
    },
  };
  return {
    scheduler,
    pending() {
      return tasks.length;
    },
    runOne() {
      const task = tasks.shift();
      if (task !== undefined) task();
    },
  };
}

describe("@interactive-os/json-document-autosave", () => {
  test("schedules autosave from document changes", async () => {
    const doc = createDoc();
    const manual = createManualScheduler();
    const saved: unknown[] = [];
    const autosave = createAutoSave(doc, {
      scheduler: manual.scheduler,
      save(event) {
        saved.push(event);
        return { savedAt: "2026-01-01T00:00:00.000Z" };
      },
    });

    expect(doc.replace("/title", "Next")).toEqual({ ok: true });
    expect(autosave.current()).toMatchObject({
      state: "pending",
      pending: true,
      sequence: 1,
    });
    expect(manual.pending()).toBe(1);

    manual.runOne();
    await Promise.resolve();

    expect(saved).toMatchObject([
      {
        value: {
          title: "Next",
          cards: [{ id: "a", title: "A" }],
        },
        reason: "change",
        sequence: 1,
        applied: [{ op: "replace", path: "/title", value: "Next" }],
      },
    ]);
    expect(autosave.current()).toMatchObject({
      state: "saved",
      pending: false,
      saving: false,
      saveCount: 1,
      lastSavedAt: "2026-01-01T00:00:00.000Z",
    });
  });

  test("coalesces multiple changes into the latest value", async () => {
    const doc = createDoc();
    const manual = createManualScheduler();
    const saved: unknown[] = [];
    createAutoSave(doc, {
      scheduler: manual.scheduler,
      save(event) {
        saved.push(event.value);
      },
    });

    doc.replace("/title", "One");
    doc.insert("/cards/-", { id: "b", title: "B" });

    expect(manual.pending()).toBe(1);
    manual.runOne();
    await Promise.resolve();

    expect(saved).toEqual([
      {
        title: "One",
        cards: [
          { id: "a", title: "A" },
          { id: "b", title: "B" },
        ],
      },
    ]);
  });

  test("flushes manually without waiting for a scheduled task", async () => {
    const doc = createDoc();
    const manual = createManualScheduler();
    const saved: unknown[] = [];
    const autosave = createAutoSave(doc, {
      scheduler: manual.scheduler,
      save(event) {
        saved.push(event.reason);
      },
    });

    autosave.request();
    expect(manual.pending()).toBe(1);

    await autosave.flush();

    expect(saved).toEqual(["manual"]);
    expect(autosave.current()).toMatchObject({
      state: "saved",
      saveCount: 1,
    });
  });

  test("supports immediate save on start", async () => {
    const doc = createDoc();
    const manual = createManualScheduler();
    const saved: unknown[] = [];
    const autosave = createAutoSave(doc, {
      immediate: true,
      scheduler: manual.scheduler,
      save(event) {
        saved.push(event.reason);
      },
    });

    expect(autosave.current()).toMatchObject({ state: "pending" });
    manual.runOne();
    await Promise.resolve();

    expect(saved).toEqual(["start"]);
  });

  test("reports save failures and can save again later", async () => {
    const doc = createDoc();
    const manual = createManualScheduler();
    let shouldFail = true;
    const autosave = createAutoSave(doc, {
      scheduler: manual.scheduler,
      save() {
        if (shouldFail) throw new Error("offline");
      },
    });

    doc.replace("/title", "Failed");
    manual.runOne();
    await Promise.resolve();

    expect(autosave.current()).toMatchObject({
      state: "error",
      saveCount: 0,
    });

    shouldFail = false;
    await autosave.flush();

    expect(autosave.current()).toMatchObject({
      state: "saved",
      saveCount: 1,
    });
  });

  test("returns isolated values to the host save function", async () => {
    const doc = createDoc();
    const manual = createManualScheduler();
    const autosave = createAutoSave(doc, {
      scheduler: manual.scheduler,
      save(event) {
        event.value.title = "Mutated";
      },
    });

    doc.replace("/title", "Next");
    manual.runOne();
    await Promise.resolve();

    expect(doc.value.title).toBe("Next");
    expect(autosave.current()).toMatchObject({ state: "saved" });
  });

  test("disposes subscription and scheduled work", async () => {
    const doc = createDoc();
    const manual = createManualScheduler();
    const saved: unknown[] = [];
    const autosave = createAutoSave(doc, {
      scheduler: manual.scheduler,
      save(event) {
        saved.push(event.value);
      },
    });

    doc.replace("/title", "Pending");
    autosave.dispose();
    manual.runOne();
    await Promise.resolve();
    doc.replace("/title", "Ignored");

    expect(saved).toEqual([]);
    expect(autosave.current()).toMatchObject({
      state: "disposed",
      pending: false,
    });
  });
});
