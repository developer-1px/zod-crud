import { existsSync } from "node:fs";
import { performance } from "node:perf_hooks";
import * as z from "zod";

const distEntry = new URL("../packages/json-document/dist/index.js", import.meta.url);
const distJsonCloneEntry = new URL("../packages/json-document/dist/foundation/json/clone.js", import.meta.url);
const distJsonSerializableEntry = new URL("../packages/json-document/dist/foundation/json/serializable.js", import.meta.url);
const distJsonPathEntry = new URL("../packages/json-document/dist/foundation/jsonpath/index.js", import.meta.url);
const distJsonPathParseEntry = new URL("../packages/json-document/dist/foundation/jsonpath/parse.js", import.meta.url);
const distJsonPathEvaluateEntry = new URL("../packages/json-document/dist/foundation/jsonpath/evaluate.js", import.meta.url);
const distPatchEntry = new URL("../packages/json-document/dist/foundation/patch/trusted.js", import.meta.url);
const distPatchInverseEntry = new URL("../packages/json-document/dist/foundation/patch/inverse.js", import.meta.url);
const distHistoryEntry = new URL("../packages/json-document/dist/foundation/history.js", import.meta.url);

if (
  !existsSync(distEntry)
  || !existsSync(distJsonCloneEntry)
  || !existsSync(distJsonSerializableEntry)
  || !existsSync(distJsonPathEntry)
  || !existsSync(distJsonPathParseEntry)
  || !existsSync(distJsonPathEvaluateEntry)
  || !existsSync(distPatchEntry)
  || !existsSync(distPatchInverseEntry)
  || !existsSync(distHistoryEntry)
) {
  console.error("Missing package dist. Run `npm run build -w @interactive-os/json-document` first.");
  process.exit(1);
}

const { applyPatch, applyPatchToTrustedState, createJSONDocument } = await import(distEntry.href);
const { cloneJsonSerializable } = await import(distJsonCloneEntry.href);
const { jsonSerializableError } = await import(distJsonSerializableEntry.href);
const { query: jsonpathQuery, queryMatches: jsonpathQueryMatches } = await import(distJsonPathEntry.href);
const { parse: parseJsonPath } = await import(distJsonPathParseEntry.href);
const { evaluate: evaluateJsonPath, matchPointers: matchJsonPathPointers } = await import(distJsonPathEvaluateEntry.href);
const { applyAcceptedPatch, applyTrustedPatch } = await import(distPatchEntry.href);
const { computeInverses } = await import(distPatchInverseEntry.href);
const {
  commitMutable,
  emptyMutableHistory,
  moveBack,
  moveForward,
} = await import(distHistoryEntry.href);

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
const OptionalItemsSchema = z.object({
  items: z.array(Item).optional(),
  settings: z.object({
    active: z.string(),
    count: z.number(),
  }),
});
const UnknownItemsSchema = z.object({
  items: z.array(z.unknown()),
});
const NestedSchema = z.object({
  wrapper: z.object({
    items: z.array(Item),
  }),
});
const EscapedSelectionSchema = z.object({
  "a/b": z.array(z.object({
    "done~flag": z.boolean(),
  })),
});
const EscapedNestedSchema = z.object({
  "a/b": z.array(z.object({
    "m~eta": z.object({
      "ra/nk": z.number(),
    }),
  })),
});
const RecursiveNode = z.lazy(() => z.object({
  id: z.string(),
  children: z.array(RecursiveNode),
}));

const sizes = envList("PERF_ITEMS", [10000, 50000]);
const batchSize = envNumber("PERF_BATCH", 1000);
const individualCount = envNumber("PERF_INDIVIDUAL", 100);
const jsonpathRepeats = envNumber("PERF_JSONPATH_REPEATS", 10000);
const rounds = envNumber("PERF_ROUNDS", 5);
const forceGc = process.env.PERF_GC === "1";
const runtimeGc = typeof globalThis.gc === "function" ? globalThis.gc.bind(globalThis) : null;

console.log("json-document core benchmark");
console.log(`items=${sizes.join(",")} batch=${batchSize} individual=${individualCount} rounds=${rounds}`);
if (forceGc) {
  console.log(`gc=${runtimeGc ? "enabled" : "unavailable (run node with --expose-gc)"}`);
}

for (const size of sizes) {
  const state = Schema.parse(makeState(size));
  const optionalItemsState = OptionalItemsSchema.parse(state);
  const nestedState = NestedSchema.parse({ wrapper: { items: state.items } });
  const escapedSelectionState = EscapedSelectionSchema.parse({
    "a/b": Array.from({ length: size }, () => ({ "done~flag": false })),
  });
  const escapedNestedState = EscapedNestedSchema.parse({
    "a/b": Array.from({ length: size }, (_, index) => ({ "m~eta": { "ra/nk": index } })),
  });
  const recursiveState = RecursiveNode.parse(makeRecursiveState(size));
  const primitiveArrayState = Array.from({ length: size }, (_, index) => index);
  const middle = Math.floor(size / 2);
  const jsonpathOne = `$.items[${middle}].done`;
  const jsonpathRegexFilter = '$.items[?search(@.title, "999")]';
  const batchOps = Array.from({ length: Math.min(batchSize, size) }, (_, index) => ({
    op: "replace",
    path: `/items/${index}/done`,
    value: true,
  }));
  const escapedSelectionBatchOps = Array.from({ length: Math.min(batchSize, size) }, (_, index) => ({
    op: "replace",
    path: `/a~1b/${index}/done~0flag`,
    value: true,
  }));
  const repeatedFieldReplaceOps = Array.from({ length: Math.min(batchSize, size) }, (_, index) => ({
    op: "replace",
    path: "/items/0/done",
    value: index % 2 === 0,
  }));
  const nestedFieldReplaceOps = Array.from({ length: Math.min(batchSize, size) }, (_, index) => ({
    op: "replace",
    path: `/items/${index}/meta/rank`,
    value: size + index,
  }));
  const escapedNestedFieldReplaceOps = Array.from({ length: Math.min(batchSize, size) }, (_, index) => ({
    op: "replace",
    path: `/a~1b/${index}/m~0eta/ra~1nk`,
    value: size + index,
  }));
  const addBatchOps = Array.from({ length: Math.min(batchSize, size) }, (_, index) => ({
    op: "add",
    path: "/items/-",
    value: makeItem(size + index),
  }));
  const itemReplaceBatchOps = Array.from({ length: Math.min(batchSize, size) }, (_, index) => ({
    op: "replace",
    path: `/items/${index}`,
    value: makeItem(size + index),
  }));
  const repeatedItemReplaceOps = Array.from({ length: Math.min(batchSize, size) }, (_, index) => ({
    op: "replace",
    path: "/items/0",
    value: makeItem(size + index),
  }));
  const insertedItems = Array.from({ length: Math.min(individualCount, size) }, (_, index) => makeItem(size + index));
  const repeatedRekeyItems = Array.from({ length: Math.min(individualCount, size) }, (_, index) => ({
    ...makeItem(index),
    id: "id-0",
  }));
  const mixedArrayOps = [
    ...insertedItems.slice(0, Math.floor(insertedItems.length / 2)).map((item) => ({
      op: "add",
      path: "/items/-",
      value: item,
    })),
    ...Array.from({ length: insertedItems.length - Math.floor(insertedItems.length / 2) }, (_, index) => ({
      op: "remove",
      path: `/items/${size - index - 1}`,
    })),
  ];
  const copyMoveCount = Math.min(individualCount, size);
  const copyMoveOps = [
    ...Array.from({ length: Math.floor(copyMoveCount / 2) }, (_, index) => ({
      op: "copy",
      from: `/items/${index}`,
      path: "/items/-",
    })),
    ...Array.from({ length: copyMoveCount - Math.floor(copyMoveCount / 2) }, () => ({
      op: "move",
      from: "/items/1",
      path: "/items/0",
    })),
  ];

  console.log(`\nitems=${size}`);
  bench("jsonSerializableError state", rounds, () => ({ ok: jsonSerializableError(state) === null }));
  bench("cloneJsonSerializable state", Math.max(3, Math.ceil(rounds / 2)), () => cloneJsonSerializable(state));
  bench("cloneJsonSerializable primitive array", Math.max(3, Math.ceil(rounds / 2)), () =>
    cloneJsonSerializable(primitiveArrayState));
  bench("createJSONDocument init history=0", Math.max(3, Math.ceil(rounds / 2)), () => {
    const doc = createJSONDocument(Schema, state, { history: 0 });
    return { ok: doc.value.items.length === size };
  });
  bench("createJSONDocument init trustedInitial history=0", Math.max(3, Math.ceil(rounds / 2)), () => {
    const doc = createJSONDocument(Schema, state, { history: 0, trustedInitial: true });
    return { ok: doc.value.items.length === size };
  });
  bench("createJSONDocument init history=100", Math.max(3, Math.ceil(rounds / 2)), () => {
    const doc = createJSONDocument(Schema, state, { history: 100 });
    return { ok: doc.value.items.length === size };
  });
  bench("createJSONDocument lazy tree init history=0", Math.max(3, Math.ceil(rounds / 2)), () => {
    const doc = createJSONDocument(RecursiveNode, recursiveState, { history: 0 });
    return { ok: doc.value.children.length === size };
  });
  bench("applyPatch single leaf replace", rounds, (index) =>
    applyPatch(Schema, state, [{
      op: "replace",
      path: `/items/${middle}/done`,
      value: index % 2 === 0,
    }]).result);
  bench(`applyPatch repeated item replace batch ${repeatedItemReplaceOps.length}`, Math.max(3, Math.ceil(rounds / 2)), () =>
    applyPatch(Schema, state, repeatedItemReplaceOps).result);
  bench("applyPatchToTrustedState single leaf replace", rounds, (index) =>
    applyPatchToTrustedState(Schema, state, [{
      op: "replace",
      path: `/items/${middle}/done`,
      value: index % 2 === 0,
    }]).result);
  bench(`applyPatchToTrustedState repeated item replace batch ${repeatedItemReplaceOps.length}`, Math.max(3, Math.ceil(rounds / 2)), () =>
    applyPatchToTrustedState(Schema, state, repeatedItemReplaceOps).result);
  bench(`applyPatchToTrustedState nested field replace batch ${nestedFieldReplaceOps.length}`, Math.max(3, Math.ceil(rounds / 2)), () =>
    applyPatchToTrustedState(Schema, state, nestedFieldReplaceOps).result);

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
    const doc = createJSONDocument(Schema, state, { history: 100 });
    bench("doc.canPatch single leaf", rounds, (index) =>
      doc.canPatch({
        op: "replace",
        path: `/items/${middle}/done`,
        value: index % 2 === 0,
      }));
  }

  {
    const doc = createJSONDocument(Schema, state, { history: 0 });
    bench("doc.canDuplicate middle", rounds, () =>
      doc.canDuplicate(`/items/${middle}`));
  }

  {
    const doc = createJSONDocument(Schema, state, { history: 0 });
    bench("doc.canDuplicate middle + rekey", rounds, () =>
      doc.canDuplicate(`/items/${middle}`, { rekey: { fields: ["id"], strategy: "suffix" } }));
  }

  {
    const doc = createJSONDocument(Schema, state, { history: 0 });
    bench("doc.duplicate middle", rounds, () =>
      doc.duplicate(`/items/${middle}`));
  }

  {
    const doc = createJSONDocument(Schema, state, { history: 0 });
    bench("doc.duplicate middle + rekey", rounds, () =>
      doc.duplicate(`/items/${middle}`, { rekey: { fields: ["id"], strategy: "suffix" } }));
  }

  {
    const doc = createJSONDocument(Schema, state, { history: 0 });
    bench("doc.canMove adjacent", rounds, () =>
      doc.canMove(`/items/${middle}`, `/items/${middle + 1}`));
  }

  {
    const doc = createJSONDocument(Schema, state, { history: 0 });
    bench("doc.canReplace jsonpath one", rounds, (index) =>
      doc.canReplace(`$.items[${middle}].done`, index % 2 === 0));
  }

  {
    const doc = createJSONDocument(Schema, state, { history: 0 });
    bench("doc.canFind jsonpath wildcard", rounds, () =>
      doc.canFind("$.items[*].id"));
  }

  {
    const doc = createJSONDocument(Schema, state, { history: 0 });
    bench("doc.query jsonpath wildcard", Math.max(3, Math.ceil(rounds / 2)), () => {
      const result = doc.query("$.items[*].id");
      return { ok: result.ok && result.pointers.length === size };
    });
  }

  bench("jsonpath queryMatches wildcard field", Math.max(3, Math.ceil(rounds / 2)), () => ({
    ok: jsonpathQueryMatches("$.items[*].id", state).length === size,
  }));

  bench(`jsonpath direct parse+evaluate ${jsonpathRepeats}`, Math.max(3, Math.ceil(rounds / 2)), () => {
    let ok = true;
    for (let index = 0; index < jsonpathRepeats; index += 1) {
      const pointers = matchJsonPathPointers(evaluateJsonPath(parseJsonPath(jsonpathOne), state));
      ok = ok && pointers[0] === `/items/${middle}/done`;
    }
    return { ok };
  });

  bench(`jsonpath cached query ${jsonpathRepeats}`, Math.max(3, Math.ceil(rounds / 2)), () => {
    let ok = true;
    for (let index = 0; index < jsonpathRepeats; index += 1) {
      const pointers = jsonpathQuery(jsonpathOne, state);
      ok = ok && pointers[0] === `/items/${middle}/done`;
    }
    return { ok };
  });
  bench("jsonpath regex filter search", Math.max(3, Math.ceil(rounds / 2)), () => ({
    ok: jsonpathQueryMatches(jsonpathRegexFilter, state).length > 0,
  }));

  {
    const doc = createJSONDocument(Schema, state, { history: 0 });
    bench("doc.canCopy /items", Math.max(3, Math.ceil(rounds / 2)), () =>
      doc.canCopy("/items"));
  }

  {
    const doc = createJSONDocument(Schema, state, { history: 0 });
    bench("doc.canCut last item", Math.max(3, Math.ceil(rounds / 2)), () =>
      doc.canCut(`/items/${size - 1}`));
  }

  {
    let doc;
    benchWithSetup("doc.clipboard.cut /items", Math.max(3, Math.ceil(rounds / 2)), () => {
      doc = createJSONDocument(OptionalItemsSchema, optionalItemsState, { history: 0 });
    }, () => doc.clipboard.cut("/items"));
  }

  {
    let doc;
    benchWithSetup("doc.clipboard.cut /items no clone", Math.max(3, Math.ceil(rounds / 2)), () => {
      doc = createJSONDocument(OptionalItemsSchema, optionalItemsState, { history: 0 });
    }, () => doc.clipboard.cut("/items", { clonePayload: false }));
  }

  {
    const doc = createJSONDocument(Schema, state, { history: 0 });
    bench("doc.canPaste direct payload single append", rounds, (index) =>
      doc.canPaste("/items/-", { payload: makeItem(size + index) }));
  }

  {
    const doc = createJSONDocument(Schema, state, { history: 0 });
    bench("doc.clipboard.paste direct payload single append", rounds, (index) =>
      doc.clipboard.paste("/items/-", { payload: makeItem(size + index) }));
  }

  {
    const doc = createJSONDocument(Schema, state, { history: 0 });
    bench(`doc.clipboard.paste direct payload spread ${insertedItems.length}`, Math.max(3, Math.ceil(rounds / 2)), () =>
      doc.clipboard.paste("/items/-", { payload: insertedItems, spread: true }));
  }

  {
    let doc;
    benchWithSetup(`doc.clipboard.paste direct payload spread ${insertedItems.length} + rekey`, Math.max(3, Math.ceil(rounds / 2)), () => {
      doc = createJSONDocument(Schema, state, { history: 0 });
    }, () =>
      doc.clipboard.paste("/items/-", {
        payload: insertedItems,
        spread: true,
        rekey: { fields: ["id"], strategy: "suffix" },
      }));
  }

  {
    let doc;
    benchWithSetup(`doc.clipboard.paste direct payload spread repeated rekey ${repeatedRekeyItems.length}`, Math.max(3, Math.ceil(rounds / 2)), () => {
      doc = createJSONDocument(Schema, state, { history: 0 });
    }, () =>
      doc.clipboard.paste("/items/-", {
        payload: repeatedRekeyItems,
        spread: true,
        rekey: { fields: ["id"], strategy: "suffix" },
      }));
  }

  {
    const doc = createJSONDocument(Schema, state, { history: 0 });
    bench(`doc.clipboard.paste direct payload spread ${insertedItems.length} before middle`, Math.max(3, Math.ceil(rounds / 2)), () =>
      doc.clipboard.paste(`/items/${middle}`, { payload: insertedItems, spread: true }));
  }

  {
    const doc = createJSONDocument(Schema, state, { history: 0 });
    bench("doc.clipboard.copy /items", Math.max(3, Math.ceil(rounds / 2)), () =>
      doc.clipboard.copy("/items"));
  }

  {
    const doc = createJSONDocument(Schema, state, { history: 0 });
    bench("doc.clipboard.copy /items no clone", Math.max(3, Math.ceil(rounds / 2)), () =>
      doc.clipboard.copy("/items", { clonePayload: false }));
  }

  {
    const doc = createJSONDocument(Schema, state, { history: 0 });
    bench("doc.clipboard.write items payload", Math.max(3, Math.ceil(rounds / 2)), () =>
      doc.clipboard.write(state.items));
  }

  {
    const doc = createJSONDocument(Schema, state, { history: 0 });
    bench("doc.clipboard.write items payload trusted", Math.max(3, Math.ceil(rounds / 2)), () =>
      doc.clipboard.write(state.items, { trustedPayload: true }));
  }

  {
    const doc = createJSONDocument(Schema, state, { history: 0 });
    bench("doc.clipboard.write items payload trusted no clone", Math.max(3, Math.ceil(rounds / 2)), () =>
      doc.clipboard.write(state.items, { trustedPayload: true, clonePayload: false }));
  }

  {
    const doc = createJSONDocument(Schema, state, { history: 0 });
    bench("doc.clipboard.write items payload validate no clone", Math.max(3, Math.ceil(rounds / 2)), () =>
      doc.clipboard.write(state.items, { clonePayload: false }));
  }

  {
    const doc = createJSONDocument(UnknownItemsSchema, { items: [] }, { history: 0 });
    bench("doc.clipboard.paste direct payload unknown replace /items", Math.max(3, Math.ceil(rounds / 2)), () =>
      doc.clipboard.paste({ replace: "/items" }, { payload: state.items }));
  }

  {
    const doc = createJSONDocument(UnknownItemsSchema, { items: [] }, { history: 0 });
    bench("doc.clipboard.paste direct payload unknown replace /items trusted", Math.max(3, Math.ceil(rounds / 2)), () =>
      doc.clipboard.paste({ replace: "/items" }, { payload: state.items, trustedPayload: true }));
  }

  {
    const doc = createJSONDocument(Schema, state, { history: 0 });
    bench("doc.clipboard.write document items payload", Math.max(3, Math.ceil(rounds / 2)), () =>
      doc.clipboard.write(doc.value.items));
  }

  {
    const doc = createJSONDocument(NestedSchema, nestedState, { history: 0 });
    bench("doc.clipboard.write nested source items payload", Math.max(3, Math.ceil(rounds / 2)), () =>
      doc.clipboard.write(doc.value.wrapper.items, { source: "/wrapper/items" }));
  }

  {
    const doc = createJSONDocument(Schema, state, { history: 0 });
    const written = doc.clipboard.write(state.items);
    if (!written.ok) throw new Error(`clipboard write setup failed: ${JSON.stringify(written)}`);
    bench("doc.clipboard.read items payload", Math.max(3, Math.ceil(rounds / 2)), () =>
      doc.clipboard.read());
  }

  {
    const doc = createJSONDocument(Schema, state, { history: 0 });
    const written = doc.clipboard.write(state.items, { trustedPayload: true, clonePayload: false });
    if (!written.ok) throw new Error(`clipboard write setup failed: ${JSON.stringify(written)}`);
    bench("doc.clipboard.read items payload no clone", Math.max(3, Math.ceil(rounds / 2)), () =>
      doc.clipboard.read({ clonePayload: false }));
  }

  {
    const doc = createJSONDocument(Schema, state, { history: 0 });
    const copied = doc.clipboard.copy("/items");
    if (!copied.ok) throw new Error(`clipboard copy setup failed: ${JSON.stringify(copied)}`);
    bench("doc.canPaste clipboard replace /items", Math.max(3, Math.ceil(rounds / 2)), () =>
      doc.canPaste({ replace: "/items" }));
  }

  {
    const doc = createJSONDocument(Schema, state, {
      history: 100,
      selection: { mode: "single", initial: [`/items/${middle}/done`] },
    });
    const selection = doc.selection?.snapshot();
    bench("doc.commit single leaf + selection", rounds, (index) =>
      doc.commit([{
        op: "replace",
        path: `/items/${middle}/done`,
        value: index % 2 === 0,
      }], selection ? { selection } : undefined));
  }

  {
    const doc = createJSONDocument(Schema, state, { history: 0 });
    bench(`doc.patch batch ${batchOps.length} history=0`, Math.max(3, Math.ceil(rounds / 2)), () =>
      doc.patch(batchOps));
  }

  {
    const selectedIndex = Math.min(batchOps.length - 1, size - 1);
    const doc = createJSONDocument(Schema, state, {
      history: 0,
      selection: { mode: "single", initial: [`/items/${selectedIndex}/done`] },
    });
    bench(`doc.patch batch ${batchOps.length} selection=single`, Math.max(3, Math.ceil(rounds / 2)), () =>
      doc.patch(batchOps));
  }

  {
    const selectedIndex = Math.min(escapedSelectionBatchOps.length - 1, size - 1);
    const doc = createJSONDocument(EscapedSelectionSchema, escapedSelectionState, {
      history: 0,
      selection: { mode: "single", initial: [`/a~1b/${selectedIndex}/done~0flag`] },
    });
    bench(`doc.patch escaped batch ${escapedSelectionBatchOps.length} selection=single`, Math.max(3, Math.ceil(rounds / 2)), () =>
      doc.patch(escapedSelectionBatchOps));
  }

  {
    const selectedCount = Math.min(500, batchOps.length, size);
    const selected = Array.from({ length: selectedCount }, (_, index) => `/items/${index}/done`);
    const doc = createJSONDocument(Schema, state, {
      history: 0,
      selection: { mode: "multiple" },
    });
    doc.selection?.selectRanges(selected);
    bench(`doc.patch batch ${batchOps.length} selection=multiple-${selectedCount}`, Math.max(3, Math.ceil(rounds / 2)), () =>
      doc.patch(batchOps));
  }

  {
    const doc = createJSONDocument(Schema, state, { history: 100 });
    bench(`doc.patch batch ${batchOps.length} history=100`, Math.max(3, Math.ceil(rounds / 2)), () =>
      doc.patch(batchOps));
  }

  {
    const doc = createJSONDocument(Schema, state, { history: 100 });
    bench(`doc.patch repeated field replace batch ${repeatedFieldReplaceOps.length} history=100`, Math.max(3, Math.ceil(rounds / 2)), () =>
      doc.patch(repeatedFieldReplaceOps));
  }

  bench(`accepted nested field replace batch ${nestedFieldReplaceOps.length}`, Math.max(3, Math.ceil(rounds / 2)), () =>
    applyAcceptedPatch(state, nestedFieldReplaceOps));
  bench(`trusted nested field replace batch ${nestedFieldReplaceOps.length}`, Math.max(3, Math.ceil(rounds / 2)), () =>
    applyTrustedPatch(state, nestedFieldReplaceOps, { valuesTrusted: true }));
  bench(`computeInverses nested field replace batch ${nestedFieldReplaceOps.length}`, Math.max(3, Math.ceil(rounds / 2)), () =>
    computeInverses(state, nestedFieldReplaceOps));
  bench(`accepted escaped nested field replace batch ${escapedNestedFieldReplaceOps.length}`, Math.max(3, Math.ceil(rounds / 2)), () =>
    applyAcceptedPatch(escapedNestedState, escapedNestedFieldReplaceOps));
  bench(`trusted escaped nested field replace batch ${escapedNestedFieldReplaceOps.length}`, Math.max(3, Math.ceil(rounds / 2)), () =>
    applyTrustedPatch(escapedNestedState, escapedNestedFieldReplaceOps, { valuesTrusted: true }));
  bench(`computeInverses escaped nested field replace batch ${escapedNestedFieldReplaceOps.length}`, Math.max(3, Math.ceil(rounds / 2)), () =>
    computeInverses(escapedNestedState, escapedNestedFieldReplaceOps));

  {
    const doc = createJSONDocument(Schema, state, { history: 0 });
    bench(`doc.patch nested field replace batch ${nestedFieldReplaceOps.length} history=0`, Math.max(3, Math.ceil(rounds / 2)), () =>
      doc.patch(nestedFieldReplaceOps));
  }
  {
    const doc = createJSONDocument(EscapedNestedSchema, escapedNestedState, { history: 0 });
    bench(`doc.patch escaped nested field replace batch ${escapedNestedFieldReplaceOps.length} history=0`, Math.max(3, Math.ceil(rounds / 2)), () =>
      doc.patch(escapedNestedFieldReplaceOps));
  }

  {
    const selectedIndex = Math.min(nestedFieldReplaceOps.length - 1, size - 1);
    const doc = createJSONDocument(Schema, state, {
      history: 0,
      selection: { mode: "single", initial: [`/items/${selectedIndex}/meta/rank`] },
    });
    bench(`doc.patch nested field replace batch ${nestedFieldReplaceOps.length} selection=single`, Math.max(3, Math.ceil(rounds / 2)), () =>
      doc.patch(nestedFieldReplaceOps));
  }

  {
    const doc = createJSONDocument(Schema, state, { history: 100 });
    bench(`doc.patch nested field replace batch ${nestedFieldReplaceOps.length} history=100`, Math.max(3, Math.ceil(rounds / 2)), () =>
      doc.patch(nestedFieldReplaceOps));
  }
  {
    const doc = createJSONDocument(EscapedNestedSchema, escapedNestedState, { history: 100 });
    bench(`doc.patch escaped nested field replace batch ${escapedNestedFieldReplaceOps.length} history=100`, Math.max(3, Math.ceil(rounds / 2)), () =>
      doc.patch(escapedNestedFieldReplaceOps));
  }

  {
    const doc = createJSONDocument(Schema, state, { history: 100 });
    const result = doc.patch(nestedFieldReplaceOps);
    if (!result.ok) throw new Error(`setup nested field replace batch failed: ${JSON.stringify(result)}`);
    benchWithSetup(`history undo nested field replace batch ${nestedFieldReplaceOps.length}`, Math.max(3, Math.ceil(rounds / 2)), () => {
      if (!doc.history.canUndo) {
        const redone = doc.history.redo();
        if (!redone) throw new Error("nested field replace redo setup failed");
      }
    }, () => {
      return { ok: doc.history.undo() };
    });
    benchWithSetup(`history redo nested field replace batch ${nestedFieldReplaceOps.length}`, Math.max(3, Math.ceil(rounds / 2)), () => {
      if (!doc.history.canRedo) {
        const undone = doc.history.undo();
        if (!undone) throw new Error("nested field replace undo setup failed");
      }
    }, () => {
      return { ok: doc.history.redo() };
    });
  }

  {
    const doc = createJSONDocument(Schema, state, { history: 0 });
    bench(`doc.patch item replace batch ${itemReplaceBatchOps.length} history=0`, Math.max(3, Math.ceil(rounds / 2)), () =>
      doc.patch(itemReplaceBatchOps));
  }

  {
    const doc = createJSONDocument(Schema, state, { history: 100 });
    bench(`doc.patch item replace batch ${itemReplaceBatchOps.length} history=100`, Math.max(3, Math.ceil(rounds / 2)), () =>
      doc.patch(itemReplaceBatchOps));
  }

  {
    const doc = createJSONDocument(Schema, state, { history: 100 });
    bench(`doc.patch repeated item replace batch ${repeatedItemReplaceOps.length} history=100`, Math.max(3, Math.ceil(rounds / 2)), () =>
      doc.patch(repeatedItemReplaceOps));
  }

  {
    const doc = createJSONDocument(Schema, state, { history: 100 });
    const result = doc.patch(repeatedItemReplaceOps);
    if (!result.ok) throw new Error(`setup repeated item replace batch failed: ${JSON.stringify(result)}`);
    benchWithSetup(`history undo repeated item replace batch ${repeatedItemReplaceOps.length}`, Math.max(3, Math.ceil(rounds / 2)), () => {
      if (!doc.history.canUndo) {
        const redone = doc.history.redo();
        if (!redone) throw new Error("repeated item replace redo setup failed");
      }
    }, () => {
      return { ok: doc.history.undo() };
    });
    benchWithSetup(`history redo repeated item replace batch ${repeatedItemReplaceOps.length}`, Math.max(3, Math.ceil(rounds / 2)), () => {
      if (!doc.history.canRedo) {
        const undone = doc.history.undo();
        if (!undone) throw new Error("repeated item replace undo setup failed");
      }
    }, () => {
      return { ok: doc.history.redo() };
    });
  }

  {
    const doc = createJSONDocument(Schema, state, { history: 100 });
    const result = doc.patch(itemReplaceBatchOps);
    if (!result.ok) throw new Error(`setup item replace batch failed: ${JSON.stringify(result)}`);
    benchWithSetup(`history undo item replace batch ${itemReplaceBatchOps.length}`, Math.max(3, Math.ceil(rounds / 2)), () => {
      if (!doc.history.canUndo) {
        const redone = doc.history.redo();
        if (!redone) throw new Error("item replace redo setup failed");
      }
    }, () => {
      return { ok: doc.history.undo() };
    });
    benchWithSetup(`history redo item replace batch ${itemReplaceBatchOps.length}`, Math.max(3, Math.ceil(rounds / 2)), () => {
      if (!doc.history.canRedo) {
        const undone = doc.history.undo();
        if (!undone) throw new Error("item replace undo setup failed");
      }
    }, () => {
      return { ok: doc.history.redo() };
    });
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
    let doc;
    benchWithSetup(`doc.patch add batch ${addBatchOps.length} history=0`, Math.max(3, Math.ceil(rounds / 2)), () => {
      doc = createJSONDocument(Schema, state, { history: 0 });
    }, () => doc.patch(addBatchOps));
  }

  {
    let doc;
    benchWithSetup(`doc.patch add batch ${addBatchOps.length} history=100`, Math.max(3, Math.ceil(rounds / 2)), () => {
      doc = createJSONDocument(Schema, state, { history: 100 });
    }, () => doc.patch(addBatchOps));
  }

  {
    let doc;
    benchWithSetup(`history undo add batch ${addBatchOps.length}`, Math.max(3, Math.ceil(rounds / 2)), () => {
      doc = createJSONDocument(Schema, state, { history: 100 });
      const patched = doc.patch(addBatchOps);
      if (!patched.ok) throw new Error(`setup add batch failed: ${JSON.stringify(patched)}`);
    }, () => {
      return { ok: doc.history.undo() };
    });
    benchWithSetup(`history redo add batch ${addBatchOps.length}`, Math.max(3, Math.ceil(rounds / 2)), () => {
      doc = createJSONDocument(Schema, state, { history: 100 });
      const patched = doc.patch(addBatchOps);
      if (!patched.ok) throw new Error(`setup add batch failed: ${JSON.stringify(patched)}`);
      const undone = doc.history.undo();
      if (!undone) throw new Error("add batch undo setup failed");
    }, () => {
      return { ok: doc.history.redo() };
    });
  }

  {
    let doc;
    const count = Math.min(individualCount, size);
    benchWithSetup(`doc.patch individual ${count} history=0`, Math.max(3, Math.ceil(rounds / 2)), () => {
      doc = createJSONDocument(Schema, state, { history: 0 });
    }, () => {
      patchDoneRange(doc, count, "individual patch");
      return { ok: true };
    });
  }

  {
    let doc;
    const count = Math.min(individualCount, size);
    benchWithSetup(`doc.patch individual ${count} history=${individualCount}`, Math.max(3, Math.ceil(rounds / 2)), () => {
      doc = createJSONDocument(Schema, state, { history: individualCount });
    }, () => {
      patchDoneRange(doc, count, "individual patch");
      return { ok: true };
    });
  }

  {
    let doc;
    const count = Math.min(individualCount, size);
    benchWithSetup(`doc.history.transaction individual ${count} history=${individualCount}`, Math.max(3, Math.ceil(rounds / 2)), () => {
      doc = createJSONDocument(Schema, state, { history: individualCount });
    }, () => {
      patchDoneTransaction(doc, count, "transaction patch");
      return { ok: doc.history.undoDepth === 1 };
    });
  }

  {
    let doc;
    const count = Math.min(individualCount, size);
    benchWithSetup(`history undo individual ${count} entries`, Math.max(3, Math.ceil(rounds / 2)), () => {
      doc = createJSONDocument(Schema, state, { history: count });
      patchDoneRange(doc, count, "setup individual patch");
    }, () => {
      undoAll(doc, count, "individual undo");
      return { ok: doc.history.undoDepth === 0 };
    });
  }

  {
    let doc;
    const count = Math.min(individualCount, size);
    benchWithSetup(`history redo individual ${count} entries`, Math.max(3, Math.ceil(rounds / 2)), () => {
      doc = createJSONDocument(Schema, state, { history: count });
      patchDoneRange(doc, count, "setup individual patch");
      undoAll(doc, count, "setup individual undo");
    }, () => {
      redoAll(doc, count, "individual redo");
      return { ok: doc.history.redoDepth === 0 };
    });
  }

  {
    let doc;
    const count = Math.min(individualCount, size);
    benchWithSetup(`history undo transaction individual ${count}`, Math.max(3, Math.ceil(rounds / 2)), () => {
      doc = createJSONDocument(Schema, state, { history: count });
      patchDoneTransaction(doc, count, "setup transaction patch");
    }, () => ({ ok: doc.history.undo() }));
  }

  {
    let doc;
    const count = Math.min(individualCount, size);
    benchWithSetup(`history redo transaction individual ${count}`, Math.max(3, Math.ceil(rounds / 2)), () => {
      doc = createJSONDocument(Schema, state, { history: count });
      patchDoneTransaction(doc, count, "setup transaction patch");
      if (!doc.history.undo()) throw new Error("setup transaction undo failed");
    }, () => ({ ok: doc.history.redo() }));
  }

  {
    let doc;
    benchWithSetup(`doc.patch individual add ${insertedItems.length} history=0`, Math.max(3, Math.ceil(rounds / 2)), () => {
      doc = createJSONDocument(Schema, state, { history: 0 });
    }, () => {
      for (let index = 0; index < insertedItems.length; index++) {
        const result = doc.patch({
          op: "add",
          path: "/items/-",
          value: insertedItems[index],
        });
        if (!result.ok) throw new Error(`individual add failed: ${JSON.stringify(result)}`);
      }
      return { ok: true };
    });
  }

  {
    let doc;
    const count = Math.min(individualCount, size);
    benchWithSetup(`doc.patch individual remove ${count} history=0`, Math.max(3, Math.ceil(rounds / 2)), () => {
      doc = createJSONDocument(Schema, state, { history: 0 });
    }, () => {
      for (let index = 0; index < count; index++) {
        const result = doc.patch({
          op: "remove",
          path: `/items/${size - index - 1}`,
        });
        if (!result.ok) throw new Error(`individual remove failed: ${JSON.stringify(result)}`);
      }
      return { ok: true };
    });
  }

  {
    const doc = createJSONDocument(Schema, state, { history: 0 });
    bench(`doc.patch mixed array batch ${mixedArrayOps.length} history=0`, Math.max(3, Math.ceil(rounds / 2)), () =>
      doc.patch(mixedArrayOps));
  }

  {
    const doc = createJSONDocument(Schema, state, { history: 100 });
    bench(`doc.patch mixed array batch ${mixedArrayOps.length} history=100`, Math.max(3, Math.ceil(rounds / 2)), () =>
      doc.patch(mixedArrayOps));
  }

  {
    const doc = createJSONDocument(Schema, state, { history: 100 });
    const result = doc.patch(mixedArrayOps);
    if (!result.ok) throw new Error(`setup mixed batch failed: ${JSON.stringify(result)}`);
    benchWithSetup(`history undo mixed array batch ${mixedArrayOps.length}`, Math.max(3, Math.ceil(rounds / 2)), () => {
      if (!doc.history.canUndo) {
        const redone = doc.history.redo();
        if (!redone) throw new Error("mixed redo setup failed");
      }
    }, () => {
      return { ok: doc.history.undo() };
    });
    benchWithSetup(`history redo mixed array batch ${mixedArrayOps.length}`, Math.max(3, Math.ceil(rounds / 2)), () => {
      if (!doc.history.canRedo) {
        const undone = doc.history.undo();
        if (!undone) throw new Error("mixed undo setup failed");
      }
    }, () => {
      return { ok: doc.history.redo() };
    });
  }

  {
    let doc;
    benchWithSetup(`doc.patch individual copy/move ${copyMoveOps.length} history=0`, Math.max(3, Math.ceil(rounds / 2)), () => {
      doc = createJSONDocument(Schema, state, { history: 0 });
    }, () => {
      for (const op of copyMoveOps) {
        const result = doc.patch(op);
        if (!result.ok) throw new Error(`individual copy/move failed: ${JSON.stringify(result)}`);
      }
      return { ok: true };
    });
  }

  {
    const doc = createJSONDocument(Schema, state, { history: 0 });
    bench(`doc.patch copy/move array batch ${copyMoveOps.length} history=0`, Math.max(3, Math.ceil(rounds / 2)), () =>
      doc.patch(copyMoveOps));
  }

  {
    const doc = createJSONDocument(Schema, state, { history: 0, selection: true });
    bench(`doc.patch copy/move array batch ${copyMoveOps.length} selection=single`, Math.max(3, Math.ceil(rounds / 2)), () =>
      doc.patch(copyMoveOps));
  }

  {
    const doc = createJSONDocument(Schema, state, { history: 0, selection: { mode: "multiple" } });
    bench(`doc.patch copy/move array batch ${copyMoveOps.length} selection=multiple`, Math.max(3, Math.ceil(rounds / 2)), () =>
      doc.patch(copyMoveOps));
  }

  {
    const doc = createJSONDocument(Schema, state, { history: 0, selection: { mode: "multiple" } });
    bench(`doc.patch add batch ${addBatchOps.length} selection=multiple`, Math.max(3, Math.ceil(rounds / 2)), () =>
      doc.patch(addBatchOps));
  }

  {
    const doc = createJSONDocument(Schema, state, { history: 100 });
    bench(`doc.patch copy/move array batch ${copyMoveOps.length} history=100`, Math.max(3, Math.ceil(rounds / 2)), () =>
      doc.patch(copyMoveOps));
  }

  {
    const doc = createJSONDocument(Schema, state, { history: 100 });
    const result = doc.patch(copyMoveOps);
    if (!result.ok) throw new Error(`setup copy/move batch failed: ${JSON.stringify(result)}`);
    benchWithSetup(`history undo copy/move array batch ${copyMoveOps.length}`, Math.max(3, Math.ceil(rounds / 2)), () => {
      if (!doc.history.canUndo) {
        const redone = doc.history.redo();
        if (!redone) throw new Error("copy/move redo setup failed");
      }
    }, () => {
      return { ok: doc.history.undo() };
    });
    benchWithSetup(`history redo copy/move array batch ${copyMoveOps.length}`, Math.max(3, Math.ceil(rounds / 2)), () => {
      if (!doc.history.canRedo) {
        const undone = doc.history.undo();
        if (!undone) throw new Error("copy/move undo setup failed");
      }
    }, () => {
      return { ok: doc.history.redo() };
    });
  }
}

{
  const rootReplaceCount = envNumber("PERF_ROOT_KEYS", batchSize);
  const RootValue = z.object({
    id: z.string(),
    done: z.boolean(),
    meta: z.object({
      rank: z.number(),
      tag: z.string(),
    }),
  });
  const RootRecord = z.record(z.string(), RootValue);
  const rootState = makeRootObjectState(rootReplaceCount);
  const rootReplaceOps = Array.from({ length: rootReplaceCount }, (_, index) => ({
    op: "replace",
    path: `/k${index}`,
    value: makeRootObjectValue(rootReplaceCount + index),
  }));
  const rootAddOps = Array.from({ length: rootReplaceCount }, (_, index) => ({
    op: "add",
    path: `/n${index}`,
    value: makeRootObjectValue(rootReplaceCount + index),
  }));
  const rootSmallAddOp = {
    op: "add",
    path: "/small",
    value: makeRootObjectValue(rootReplaceCount * 3),
  };
  const rootRemoveOps = Array.from({ length: rootReplaceCount }, (_, index) => ({
    op: "remove",
    path: `/k${index}`,
  }));
  console.log(`\nroot keys=${rootReplaceCount}`);
  bench(`createJSONDocument root record init history=0`, Math.max(3, Math.ceil(rounds / 2)), () => {
    const doc = createJSONDocument(RootRecord, rootState, { history: 0 });
    return { ok: Object.keys(doc.value).length === rootReplaceCount };
  });
  bench(`applyPatch root object replace batch ${rootReplaceCount}`, Math.max(3, Math.ceil(rounds / 2)), () =>
    applyPatch(RootRecord, rootState, rootReplaceOps).result);
  {
    const doc = createJSONDocument(RootRecord, rootState, { history: 0 });
    bench(`doc.patch root object replace batch ${rootReplaceCount} history=0`, Math.max(3, Math.ceil(rounds / 2)), () =>
      doc.patch(rootReplaceOps));
  }
  {
    const doc = createJSONDocument(RootRecord, rootState, { history: 100 });
    bench(`doc.patch root object replace batch ${rootReplaceCount} history=100`, Math.max(3, Math.ceil(rounds / 2)), () =>
      doc.patch(rootReplaceOps));
  }
  {
    const doc = createJSONDocument(RootRecord, rootState, { history: 100 });
    const result = doc.patch(rootReplaceOps);
    if (!result.ok) throw new Error(`setup root replace batch failed: ${JSON.stringify(result)}`);
    benchWithSetup(`history undo root object replace batch ${rootReplaceCount}`, Math.max(3, Math.ceil(rounds / 2)), () => {
      if (!doc.history.canUndo) {
        const redone = doc.history.redo();
        if (!redone) throw new Error("root replace redo setup failed");
      }
    }, () => {
      return { ok: doc.history.undo() };
    });
    benchWithSetup(`history redo root object replace batch ${rootReplaceCount}`, Math.max(3, Math.ceil(rounds / 2)), () => {
      if (!doc.history.canRedo) {
        const undone = doc.history.undo();
        if (!undone) throw new Error("root replace undo setup failed");
      }
    }, () => {
      return { ok: doc.history.redo() };
    });
  }
  bench(`accepted root object replace batch ${rootReplaceCount}`, Math.max(3, Math.ceil(rounds / 2)), () =>
    applyAcceptedPatch(rootState, rootReplaceOps));
  bench(`trusted root object replace batch ${rootReplaceCount}`, Math.max(3, Math.ceil(rounds / 2)), () =>
    applyTrustedPatch(rootState, rootReplaceOps, { valuesTrusted: true }));
  {
    let doc;
    benchWithSetup(`doc.patch root object add batch ${rootReplaceCount} history=0`, Math.max(3, Math.ceil(rounds / 2)), () => {
      doc = createJSONDocument(RootRecord, rootState, { history: 0 });
    }, () => doc.patch(rootAddOps));
  }
  {
    let doc;
    benchWithSetup(`doc.patch root object add batch ${rootReplaceCount} history=100`, Math.max(3, Math.ceil(rounds / 2)), () => {
      doc = createJSONDocument(RootRecord, rootState, { history: 100 });
    }, () => doc.patch(rootAddOps));
  }
  {
    let doc;
    benchWithSetup(`history undo root object add batch ${rootReplaceCount}`, Math.max(3, Math.ceil(rounds / 2)), () => {
      doc = createJSONDocument(RootRecord, rootState, { history: 100 });
      const patched = doc.patch(rootAddOps);
      if (!patched.ok) throw new Error(`setup root add batch failed: ${JSON.stringify(patched)}`);
    }, () => {
      return { ok: doc.history.undo() };
    });
    benchWithSetup(`history redo root object add batch ${rootReplaceCount}`, Math.max(3, Math.ceil(rounds / 2)), () => {
      doc = createJSONDocument(RootRecord, rootState, { history: 100 });
      const patched = doc.patch(rootAddOps);
      if (!patched.ok) throw new Error(`setup root add batch failed: ${JSON.stringify(patched)}`);
      const undone = doc.history.undo();
      if (!undone) throw new Error("root add undo setup failed");
    }, () => {
      return { ok: doc.history.redo() };
    });
    benchHeapRetained(`history root object add redo then small patch retained heap ${rootReplaceCount}`, Math.max(3, Math.ceil(rounds / 2)), () => {
      const subject = createJSONDocument(RootRecord, rootState, { history: 100 });
      const patched = subject.patch(rootAddOps);
      if (!patched.ok) throw new Error(`setup root add batch failed: ${JSON.stringify(patched)}`);
      const undone = subject.history.undo();
      if (!undone) throw new Error("root add undo setup failed");
      const redone = subject.history.redo();
      if (!redone) throw new Error("root add redo setup failed");
      const result = subject.patch(rootSmallAddOp);
      return { subject, result };
    });
  }
  bench(`accepted root object add batch ${rootReplaceCount}`, Math.max(3, Math.ceil(rounds / 2)), () =>
    applyAcceptedPatch(rootState, rootAddOps));
  bench(`trusted root object add batch ${rootReplaceCount}`, Math.max(3, Math.ceil(rounds / 2)), () =>
    applyTrustedPatch(rootState, rootAddOps, { valuesTrusted: true }));
  {
    let doc;
    benchWithSetup(`doc.patch root object remove batch ${rootReplaceCount} history=0`, Math.max(3, Math.ceil(rounds / 2)), () => {
      doc = createJSONDocument(RootRecord, rootState, { history: 0 });
    }, () => doc.patch(rootRemoveOps));
  }
  {
    let doc;
    benchWithSetup(`doc.patch root object remove batch ${rootReplaceCount} history=100`, Math.max(3, Math.ceil(rounds / 2)), () => {
      doc = createJSONDocument(RootRecord, rootState, { history: 100 });
    }, () => doc.patch(rootRemoveOps));
  }
  {
    let doc;
    benchWithSetup(`history undo root object remove batch ${rootReplaceCount}`, Math.max(3, Math.ceil(rounds / 2)), () => {
      doc = createJSONDocument(RootRecord, rootState, { history: 100 });
      const patched = doc.patch(rootRemoveOps);
      if (!patched.ok) throw new Error(`setup root remove batch failed: ${JSON.stringify(patched)}`);
    }, () => {
      return { ok: doc.history.undo() };
    });
    benchWithSetup(`history redo root object remove batch ${rootReplaceCount}`, Math.max(3, Math.ceil(rounds / 2)), () => {
      doc = createJSONDocument(RootRecord, rootState, { history: 100 });
      const patched = doc.patch(rootRemoveOps);
      if (!patched.ok) throw new Error(`setup root remove batch failed: ${JSON.stringify(patched)}`);
      const undone = doc.history.undo();
      if (!undone) throw new Error("root remove undo setup failed");
    }, () => {
      return { ok: doc.history.redo() };
    });
  }
  bench(`accepted root object remove batch ${rootReplaceCount}`, Math.max(3, Math.ceil(rounds / 2)), () =>
    applyAcceptedPatch(rootState, rootRemoveOps));
  bench(`trusted root object remove batch ${rootReplaceCount}`, Math.max(3, Math.ceil(rounds / 2)), () =>
    applyTrustedPatch(rootState, rootRemoveOps, { valuesTrusted: true }));
}

{
  const historyDepth = envNumber("PERF_HISTORY_DEPTH", 10000);
  const historyEdits = envNumber("PERF_HISTORY_EDITS", historyDepth * 5);
  const transactionEdits = envNumber("PERF_TRANSACTION_EDITS", historyDepth * 2);
  const TinySchema = z.object({ value: z.number() });
  const doc = createJSONDocument(TinySchema, { value: 0 }, { history: historyDepth });
  const commitElapsed = time(() => {
    for (let index = 1; index <= historyDepth; index += 1) {
      const result = doc.patch({ op: "replace", path: "/value", value: index });
      if (!result.ok) throw new Error(`history depth patch failed: ${JSON.stringify(result)}`);
    }
  });
  const undoElapsed = time(() => {
    for (let index = 0; index < historyDepth; index += 1) {
      if (!doc.history.undo()) throw new Error("history depth undo failed");
    }
  });
  const redoElapsed = time(() => {
    for (let index = 0; index < historyDepth; index += 1) {
      if (!doc.history.redo()) throw new Error("history depth redo failed");
    }
  });
  console.log(`history depth ${historyDepth} commit: ${commitElapsed.toFixed(2)}ms`);
  console.log(`history depth ${historyDepth} undo all: ${undoElapsed.toFixed(2)}ms`);
  console.log(`history depth ${historyDepth} redo all: ${redoElapsed.toFixed(2)}ms`);

  const overflowDoc = createJSONDocument(TinySchema, { value: 0 }, { history: historyDepth });
  const overflowElapsed = time(() => {
    for (let index = 1; index <= historyEdits; index += 1) {
      const result = overflowDoc.patch({ op: "replace", path: "/value", value: index });
      if (!result.ok) throw new Error(`history overflow patch failed: ${JSON.stringify(result)}`);
    }
  });
  console.log(`history limit ${historyDepth} overflow ${historyEdits} commits: ${overflowElapsed.toFixed(2)}ms`);

  const transactionDoc = createJSONDocument(TinySchema, { value: 0 }, { history: transactionEdits + 1 });
  const transactionElapsed = time(() => {
    transactionDoc.history.transaction(() => {
      for (let index = 1; index <= transactionEdits; index += 1) {
        const result = transactionDoc.patch({ op: "replace", path: "/value", value: index });
        if (!result.ok) throw new Error(`transaction patch failed: ${JSON.stringify(result)}`);
      }
    });
  });
  if (transactionDoc.history.undoDepth !== 1) {
    throw new Error(`transaction history merge failed: ${transactionDoc.history.undoDepth}`);
  }
  const transactionUndoElapsed = time(() => {
    if (!transactionDoc.history.undo()) throw new Error("transaction undo failed");
  });
  const transactionRedoElapsed = time(() => {
    if (!transactionDoc.history.redo()) throw new Error("transaction redo failed");
  });
  console.log(`history transaction ${transactionEdits} commits: ${transactionElapsed.toFixed(2)}ms`);
  console.log(`history transaction ${transactionEdits} undo: ${transactionUndoElapsed.toFixed(2)}ms`);
  console.log(`history transaction ${transactionEdits} redo: ${transactionRedoElapsed.toFixed(2)}ms`);

  const mergeLastDoc = createJSONDocument(TinySchema, { value: 0 }, { history: transactionEdits + 1 });
  const mergeLastElapsed = time(() => {
    for (let index = 1; index <= transactionEdits; index += 1) {
      const result = mergeLastDoc.patch({ op: "replace", path: "/value", value: index });
      if (!result.ok) throw new Error(`mergeLast patch failed: ${JSON.stringify(result)}`);
      if (index > 1 && !mergeLastDoc.history.mergeLast()) throw new Error("mergeLast failed");
    }
  });
  if (mergeLastDoc.history.undoDepth !== 1) {
    throw new Error(`mergeLast history merge failed: ${mergeLastDoc.history.undoDepth}`);
  }
  console.log(`history mergeLast repeated replace ${transactionEdits} commits: ${mergeLastElapsed.toFixed(2)}ms`);

  const reducerStack = emptyMutableHistory();
  const reducerCommitElapsed = time(() => {
    for (let index = 1; index <= historyEdits; index += 1) {
      commitMutable(reducerStack, { index }, historyDepth);
    }
  });
  const reducerUndoElapsed = time(() => {
    for (let index = 0; index < historyDepth; index += 1) {
      moveBack(reducerStack);
    }
  });
  const reducerRedoElapsed = time(() => {
    for (let index = 0; index < historyDepth; index += 1) {
      moveForward(reducerStack);
    }
  });
  console.log(`history reducer limit ${historyDepth} overflow ${historyEdits} commits: ${reducerCommitElapsed.toFixed(2)}ms`);
  console.log(`history reducer depth ${historyDepth} undo all: ${reducerUndoElapsed.toFixed(2)}ms`);
  console.log(`history reducer depth ${historyDepth} redo all: ${reducerRedoElapsed.toFixed(2)}ms`);
}

function makeState(size) {
  return {
    items: Array.from({ length: size }, (_, index) => makeItem(index)),
    settings: {
      active: "main",
      count: size,
    },
  };
}

function makeItem(index) {
  return {
    id: `id-${index}`,
    title: `item ${index}`,
    done: false,
    value: index,
    meta: {
      tag: `tag-${index % 10}`,
      rank: index % 100,
    },
  };
}

function makeRecursiveState(size) {
  return {
    id: "root",
    children: Array.from({ length: size }, (_, index) => ({
      id: `id-${index}`,
      children: [],
    })),
  };
}

function makeRootObjectState(size) {
  return Object.fromEntries(
    Array.from({ length: size }, (_, index) => [`k${index}`, makeRootObjectValue(index)]),
  );
}

function makeRootObjectValue(index) {
  return {
    id: `id-${index}`,
    done: false,
    meta: {
      rank: index,
      tag: `tag-${index % 10}`,
    },
  };
}

function patchDoneRange(doc, count, label) {
  for (let index = 0; index < count; index++) {
    const result = doc.patch({
      op: "replace",
      path: `/items/${index}/done`,
      value: true,
    });
    if (!result.ok) throw new Error(`${label} failed: ${JSON.stringify(result)}`);
  }
}

function patchDoneTransaction(doc, count, label) {
  doc.history.transaction(() => {
    patchDoneRange(doc, count, label);
  });
}

function undoAll(doc, count, label) {
  for (let index = 0; index < count; index++) {
    if (!doc.history.undo()) throw new Error(`${label} failed at ${index}`);
  }
}

function redoAll(doc, count, label) {
  for (let index = 0; index < count; index++) {
    if (!doc.history.redo()) throw new Error(`${label} failed at ${index}`);
  }
}

function bench(label, sampleCount, fn) {
  const samples = [];
  let last;
  for (let index = 0; index < sampleCount; index++) {
    maybeCollectGarbage();
    const started = performance.now();
    last = fn(index);
    samples.push(performance.now() - started);
  }
  const { avg, min, p50, p90, max } = sampleStats(samples);
  const ok = resultOk(last);
  console.log(`${label}: avg=${avg.toFixed(2)}ms min=${min.toFixed(2)}ms p50=${p50.toFixed(2)}ms p90=${p90.toFixed(2)}ms max=${max.toFixed(2)}ms ok=${ok}`);
}

function benchWithSetup(label, sampleCount, setup, fn) {
  const samples = [];
  let last;
  for (let index = 0; index < sampleCount; index++) {
    setup(index);
    maybeCollectGarbage();
    const started = performance.now();
    last = fn(index);
    samples.push(performance.now() - started);
  }
  const { avg, min, p50, p90, max } = sampleStats(samples);
  const ok = resultOk(last);
  console.log(`${label}: avg=${avg.toFixed(2)}ms min=${min.toFixed(2)}ms p50=${p50.toFixed(2)}ms p90=${p90.toFixed(2)}ms max=${max.toFixed(2)}ms ok=${ok}`);
}

function benchHeapRetained(label, sampleCount, fn) {
  const samples = [];
  const subjects = [];
  const cleanups = [];
  let last;
  maybeCollectGarbage();
  const baseline = process.memoryUsage().heapUsed;
  for (let index = 0; index < sampleCount; index++) {
    const retained = fn(index);
    last = retained.result;
    subjects.push(retained.subject);
    cleanups.push(retained.cleanup);
    maybeCollectGarbage();
    samples.push((process.memoryUsage().heapUsed - baseline) / subjects.length);
  }
  for (let index = 0; index < subjects.length; index += 1) {
    const cleanup = cleanups[index];
    if (typeof cleanup === "function") cleanup(subjects[index]);
  }
  subjects.length = 0;
  const { avg, min, p50, p90, max } = sampleStats(samples);
  const ok = resultOk(last);
  console.log(`${label}: avg=${formatBytes(avg)} min=${formatBytes(min)} p50=${formatBytes(p50)} p90=${formatBytes(p90)} max=${formatBytes(max)} ok=${ok}`);
}

function resultOk(value) {
  if (typeof value !== "object" || value === null) return "n/a";
  if ("ok" in value) return value.ok;
  if (
    "result" in value
    && typeof value.result === "object"
    && value.result !== null
    && "ok" in value.result
  ) {
    return value.result.ok;
  }
  return "n/a";
}

function formatBytes(value) {
  return `${(value / 1024 / 1024).toFixed(2)}MB`;
}

function sampleStats(samples) {
  const sorted = [...samples].sort((left, right) => left - right);
  return {
    avg: samples.reduce((total, sample) => total + sample, 0) / samples.length,
    min: sorted[0],
    p50: sorted[Math.floor(sorted.length / 2)],
    p90: sorted[Math.floor(sorted.length * 0.9)],
    max: sorted[sorted.length - 1],
  };
}

function time(fn) {
  maybeCollectGarbage();
  const started = performance.now();
  fn();
  return performance.now() - started;
}

function maybeCollectGarbage() {
  if (forceGc) runtimeGc?.();
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
