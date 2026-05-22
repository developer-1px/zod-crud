import { existsSync } from "node:fs";
import { performance } from "node:perf_hooks";
import * as z from "zod";

const distEntry = new URL("../packages/zod-crud/dist/index.js", import.meta.url);

if (!existsSync(distEntry)) {
  console.error("Missing package dist. Run `npm run build -w zod-crud` first.");
  process.exit(1);
}

const { applyPatch, createJSONDocument } = await import(distEntry.href);

const Item = z.object({
  id: z.string(),
  title: z.string(),
  done: z.boolean(),
  value: z.number(),
  meta: z.object({
    tag: z.string(),
    rank: z.number(),
  }),
});
const Schema = z.object({
  items: z.array(Item),
  settings: z.object({
    active: z.string(),
    count: z.number(),
  }),
});

const sizes = envList("PERF_ITEMS", [10000, 50000]);
const batchSize = envNumber("PERF_BATCH", 1000);
const individualCount = envNumber("PERF_INDIVIDUAL", 100);
const rounds = envNumber("PERF_ROUNDS", 5);

console.log("zod-crud core benchmark");
console.log(`items=${sizes.join(",")} batch=${batchSize} individual=${individualCount} rounds=${rounds}`);

for (const size of sizes) {
  const state = Schema.parse(makeState(size));
  const middle = Math.floor(size / 2);
  const batchOps = Array.from({ length: Math.min(batchSize, size) }, (_, index) => ({
    op: "replace",
    path: `/items/${index}/done`,
    value: true,
  }));

  console.log(`\nitems=${size}`);
  bench("applyPatch single leaf replace", rounds, (index) =>
    applyPatch(Schema, state, [{
      op: "replace",
      path: `/items/${middle}/done`,
      value: index % 2 === 0,
    }]).result);

  {
    const doc = createJSONDocument(Schema, state, { history: 100 });
    bench("doc.patch single leaf + history", rounds, (index) =>
      doc.patch({
        op: "replace",
        path: `/items/${middle}/done`,
        value: index % 2 === 0,
      }));
  }

  {
    const doc = createJSONDocument(Schema, state, { history: 0 });
    bench(`doc.patch batch ${batchOps.length} history=0`, Math.max(3, Math.ceil(rounds / 2)), () =>
      doc.patch(batchOps));
  }

  {
    const doc = createJSONDocument(Schema, state, { history: 100 });
    bench(`doc.patch batch ${batchOps.length} history=100`, Math.max(3, Math.ceil(rounds / 2)), () =>
      doc.patch(batchOps));
  }

  {
    const doc = createJSONDocument(Schema, state, { history: 100 });
    const result = doc.patch(batchOps);
    if (!result.ok) throw new Error(`setup batch failed: ${JSON.stringify(result)}`);
    benchWithSetup(`history undo batch ${batchOps.length}`, Math.max(3, Math.ceil(rounds / 2)), () => {
      if (!doc.history.canUndo) {
        const redone = doc.history.redo();
        if (!redone) throw new Error("redo setup failed");
      }
    }, () => {
      return { ok: doc.history.undo() };
    });
    benchWithSetup(`history redo batch ${batchOps.length}`, Math.max(3, Math.ceil(rounds / 2)), () => {
      if (!doc.history.canRedo) {
        const undone = doc.history.undo();
        if (!undone) throw new Error("undo setup failed");
      }
    }, () => {
      return { ok: doc.history.redo() };
    });
  }

  {
    const doc = createJSONDocument(Schema, state, { history: 0 });
    const elapsed = time(() => {
      for (let index = 0; index < Math.min(individualCount, size); index++) {
        const result = doc.patch({
          op: "replace",
          path: `/items/${index}/done`,
          value: true,
        });
        if (!result.ok) throw new Error(`individual patch failed: ${JSON.stringify(result)}`);
      }
    });
    console.log(`doc.patch individual ${Math.min(individualCount, size)} history=0: ${elapsed.toFixed(2)}ms`);
  }

  {
    const doc = createJSONDocument(Schema, state, { history: individualCount });
    const elapsed = time(() => {
      for (let index = 0; index < Math.min(individualCount, size); index++) {
        const result = doc.patch({
          op: "replace",
          path: `/items/${index}/done`,
          value: true,
        });
        if (!result.ok) throw new Error(`individual patch failed: ${JSON.stringify(result)}`);
      }
    });
    console.log(`doc.patch individual ${Math.min(individualCount, size)} history=${individualCount}: ${elapsed.toFixed(2)}ms`);
  }
}

function makeState(size) {
  return {
    items: Array.from({ length: size }, (_, index) => ({
      id: `id-${index}`,
      title: `item ${index}`,
      done: false,
      value: index,
      meta: {
        tag: `tag-${index % 10}`,
        rank: index % 100,
      },
    })),
    settings: {
      active: "main",
      count: size,
    },
  };
}

function bench(label, sampleCount, fn) {
  const samples = [];
  let last;
  for (let index = 0; index < sampleCount; index++) {
    const started = performance.now();
    last = fn(index);
    samples.push(performance.now() - started);
  }
  const avg = samples.reduce((total, sample) => total + sample, 0) / samples.length;
  const min = Math.min(...samples);
  const max = Math.max(...samples);
  const ok = typeof last === "object" && last !== null && "ok" in last ? last.ok : "n/a";
  console.log(`${label}: avg=${avg.toFixed(2)}ms min=${min.toFixed(2)}ms max=${max.toFixed(2)}ms ok=${ok}`);
}

function benchWithSetup(label, sampleCount, setup, fn) {
  const samples = [];
  let last;
  for (let index = 0; index < sampleCount; index++) {
    setup(index);
    const started = performance.now();
    last = fn(index);
    samples.push(performance.now() - started);
  }
  const avg = samples.reduce((total, sample) => total + sample, 0) / samples.length;
  const min = Math.min(...samples);
  const max = Math.max(...samples);
  const ok = typeof last === "object" && last !== null && "ok" in last ? last.ok : "n/a";
  console.log(`${label}: avg=${avg.toFixed(2)}ms min=${min.toFixed(2)}ms max=${max.toFixed(2)}ms ok=${ok}`);
}

function time(fn) {
  const started = performance.now();
  fn();
  return performance.now() - started;
}

function envList(name, fallback) {
  const value = process.env[name];
  if (!value) return fallback;
  return value.split(",").map((item) => Number(item.trim())).filter((item) => Number.isFinite(item) && item > 0);
}

function envNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
