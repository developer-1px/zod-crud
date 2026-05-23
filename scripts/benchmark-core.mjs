import { existsSync } from "node:fs";
import { performance } from "node:perf_hooks";
import * as z from "zod";

const distEntry = new URL("../packages/zod-crud/dist/index.js", import.meta.url);
const distJsonEntry = new URL("../packages/zod-crud/dist/foundation/json.js", import.meta.url);
const distJsonPathEntry = new URL("../packages/zod-crud/dist/foundation/jsonpath/index.js", import.meta.url);
const distPatchEntry = new URL("../packages/zod-crud/dist/foundation/json-patch/index.js", import.meta.url);
const distPatchInverseEntry = new URL("../packages/zod-crud/dist/foundation/json-patch/inverse.js", import.meta.url);
const distHistoryEntry = new URL("../packages/zod-crud/dist/foundation/history.js", import.meta.url);

if (
  !existsSync(distEntry)
  || !existsSync(distJsonEntry)
  || !existsSync(distJsonPathEntry)
  || !existsSync(distPatchEntry)
  || !existsSync(distPatchInverseEntry)
  || !existsSync(distHistoryEntry)
) {
  console.error("Missing package dist. Run `npm run build -w zod-crud` first.");
  process.exit(1);
}

const { applyPatch, applyPatchToTrustedState, createJSONDocument } = await import(distEntry.href);
const { cloneJsonSerializable, jsonSerializableError } = await import(distJsonEntry.href);
const {
  evaluate: evaluateJsonPath,
  matchPointers: matchJsonPathPointers,
  parse: parseJsonPath,
  query: jsonpathQuery,
} = await import(distJsonPathEntry.href);
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
const NestedSchema = z.object({
  wrapper: z.object({
    items: z.array(Item),
  }),
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

console.log("zod-crud core benchmark");
console.log(`items=${sizes.join(",")} batch=${batchSize} individual=${individualCount} rounds=${rounds}`);

for (const size of sizes) {
  const state = Schema.parse(makeState(size));
  const nestedState = NestedSchema.parse({ wrapper: { items: state.items } });
  const recursiveState = RecursiveNode.parse(makeRecursiveState(size));
  const primitiveArrayState = Array.from({ length: size }, (_, index) => index);
  const middle = Math.floor(size / 2);
  const jsonpathOne = `$.items[${middle}].done`;
  const batchOps = Array.from({ length: Math.min(batchSize, size) }, (_, index) => ({
    op: "replace",
    path: `/items/${index}/done`,
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
    const doc = createJSONDocument(Schema, state, { history: 0 });
    bench("doc.canPastePayload single append", rounds, (index) =>
      doc.canPastePayload("/items/-", makeItem(size + index)));
  }

  {
    const doc = createJSONDocument(Schema, state, { history: 0 });
    bench("doc.clipboard.pastePayload single append", rounds, (index) =>
      doc.clipboard.pastePayload("/items/-", makeItem(size + index)));
  }

  {
    const doc = createJSONDocument(Schema, state, { history: 0 });
    bench(`doc.clipboard.pastePayload spread ${insertedItems.length}`, Math.max(3, Math.ceil(rounds / 2)), () =>
      doc.clipboard.pastePayload("/items/-", insertedItems, { spread: true }));
  }

  {
    let doc;
    benchWithSetup(`doc.clipboard.pastePayload spread ${insertedItems.length} + rekey`, Math.max(3, Math.ceil(rounds / 2)), () => {
      doc = createJSONDocument(Schema, state, { history: 0 });
    }, () =>
      doc.clipboard.pastePayload("/items/-", insertedItems, {
        spread: true,
        rekey: { fields: ["id"], strategy: "suffix" },
      }));
  }

  {
    let doc;
    benchWithSetup(`doc.clipboard.pastePayload spread repeated rekey ${repeatedRekeyItems.length}`, Math.max(3, Math.ceil(rounds / 2)), () => {
      doc = createJSONDocument(Schema, state, { history: 0 });
    }, () =>
      doc.clipboard.pastePayload("/items/-", repeatedRekeyItems, {
        spread: true,
        rekey: { fields: ["id"], strategy: "suffix" },
      }));
  }

  {
    const doc = createJSONDocument(Schema, state, { history: 0 });
    bench(`doc.clipboard.pastePayload spread ${insertedItems.length} before middle`, Math.max(3, Math.ceil(rounds / 2)), () =>
      doc.clipboard.pastePayload(`/items/${middle}`, insertedItems, { spread: true }));
  }

  {
    const doc = createJSONDocument(Schema, state, { history: 0 });
    bench("doc.clipboard.copy /items", Math.max(3, Math.ceil(rounds / 2)), () =>
      doc.clipboard.copy("/items"));
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

  {
    const doc = createJSONDocument(Schema, state, { history: 0 });
    bench(`doc.patch nested field replace batch ${nestedFieldReplaceOps.length} history=0`, Math.max(3, Math.ceil(rounds / 2)), () =>
      doc.patch(nestedFieldReplaceOps));
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

  {
    const doc = createJSONDocument(Schema, state, { history: 0 });
    const elapsed = time(() => {
      for (let index = 0; index < insertedItems.length; index++) {
        const result = doc.patch({
          op: "add",
          path: "/items/-",
          value: insertedItems[index],
        });
        if (!result.ok) throw new Error(`individual add failed: ${JSON.stringify(result)}`);
      }
    });
    console.log(`doc.patch individual add ${insertedItems.length} history=0: ${elapsed.toFixed(2)}ms`);
  }

  {
    const doc = createJSONDocument(Schema, state, { history: 0 });
    const elapsed = time(() => {
      for (let index = 0; index < Math.min(individualCount, size); index++) {
        const result = doc.patch({
          op: "remove",
          path: `/items/${size - index - 1}`,
        });
        if (!result.ok) throw new Error(`individual remove failed: ${JSON.stringify(result)}`);
      }
    });
    console.log(`doc.patch individual remove ${Math.min(individualCount, size)} history=0: ${elapsed.toFixed(2)}ms`);
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
    const doc = createJSONDocument(Schema, state, { history: 0 });
    const elapsed = time(() => {
      for (const op of copyMoveOps) {
        const result = doc.patch(op);
        if (!result.ok) throw new Error(`individual copy/move failed: ${JSON.stringify(result)}`);
      }
    });
    console.log(`doc.patch individual copy/move ${copyMoveOps.length} history=0: ${elapsed.toFixed(2)}ms`);
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

function bench(label, sampleCount, fn) {
  const samples = [];
  let last;
  for (let index = 0; index < sampleCount; index++) {
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
    const started = performance.now();
    last = fn(index);
    samples.push(performance.now() - started);
  }
  const { avg, min, p50, p90, max } = sampleStats(samples);
  const ok = resultOk(last);
  console.log(`${label}: avg=${avg.toFixed(2)}ms min=${min.toFixed(2)}ms p50=${p50.toFixed(2)}ms p90=${p90.toFixed(2)}ms max=${max.toFixed(2)}ms ok=${ok}`);
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
