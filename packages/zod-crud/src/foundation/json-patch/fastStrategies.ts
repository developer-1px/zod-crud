import {
  applyAppendOnlyAddPatch,
  applySameArrayStructuralPatch,
  applyTailRemovePatch,
} from "./fastArrayStructural.js";
import {
  applyIndependentReplacePatch,
  applySameArrayElementReplacePatch,
  applySameArrayFieldReplacePatch,
  applySameArrayNestedReplacePatch,
} from "./fastReplace.js";
import {
  applyRootObjectAddPatch,
  applyRootObjectRemovePatch,
  applyRootObjectReplacePatch,
} from "./fastRootObject.js";
import type { FastPatchResult, JSONPatchOperation } from "./types.js";

type FastPatchSuccess = Extract<FastPatchResult, { handled: true }>;

interface FastPatchStrategyOptions {
  valuesTrusted: boolean;
}

type FastPatchStrategy = (
  state: unknown,
  ops: ReadonlyArray<JSONPatchOperation>,
  options: FastPatchStrategyOptions,
) => FastPatchResult;

const appendOnlyAdd: FastPatchStrategy = (state, ops, options) =>
  applyAppendOnlyAddPatch(state, ops, options.valuesTrusted);

const tailRemove: FastPatchStrategy = (state, ops) =>
  applyTailRemovePatch(state, ops);

const rootObjectRemove: FastPatchStrategy = (state, ops) =>
  applyRootObjectRemovePatch(state, ops);

const rootObjectAdd: FastPatchStrategy = (state, ops, options) =>
  applyRootObjectAddPatch(state, ops, options.valuesTrusted);

const rootObjectReplace: FastPatchStrategy = (state, ops, options) =>
  applyRootObjectReplacePatch(state, ops, options.valuesTrusted);

const rootObjectReplaceWhenValuesTrusted: FastPatchStrategy = (state, ops, options) =>
  options.valuesTrusted
    ? applyRootObjectReplacePatch(state, ops, true)
    : { handled: false };

const arrayFieldReplace: FastPatchStrategy = (state, ops, options) =>
  applySameArrayFieldReplacePatch(state, ops, options.valuesTrusted);

const arrayNestedReplace: FastPatchStrategy = (state, ops, options) =>
  applySameArrayNestedReplacePatch(state, ops, options.valuesTrusted);

const arrayElementReplace: FastPatchStrategy = (state, ops, options) =>
  applySameArrayElementReplacePatch(state, ops, options.valuesTrusted);

const independentReplace: FastPatchStrategy = (state, ops, options) =>
  applyIndependentReplacePatch(state, ops, options.valuesTrusted);

const arrayStructural: FastPatchStrategy = (state, ops, options) =>
  applySameArrayStructuralPatch(state, ops, options.valuesTrusted);

const publicTrustedStateStrategies: readonly FastPatchStrategy[] = [
  appendOnlyAdd,
  tailRemove,
  rootObjectRemove,
  rootObjectAdd,
  rootObjectReplace,
  arrayFieldReplace,
  arrayNestedReplace,
  arrayElementReplace,
  independentReplace,
  arrayStructural,
];

const trustedStrategies: readonly FastPatchStrategy[] = [
  appendOnlyAdd,
  tailRemove,
  rootObjectRemove,
  rootObjectAdd,
  arrayFieldReplace,
  arrayNestedReplace,
  rootObjectReplaceWhenValuesTrusted,
  arrayElementReplace,
  independentReplace,
  arrayStructural,
];

const acceptedStrategies: readonly FastPatchStrategy[] = [
  rootObjectRemove,
  rootObjectAdd,
  rootObjectReplace,
  arrayFieldReplace,
  arrayNestedReplace,
  arrayElementReplace,
];

export function applyPublicTrustedStateFastPatch(
  state: unknown,
  ops: ReadonlyArray<JSONPatchOperation>,
): FastPatchSuccess | null {
  return applyFastPatchStrategies(state, ops, publicTrustedStateStrategies, false);
}

export function applyTrustedFastPatch(
  state: unknown,
  ops: ReadonlyArray<JSONPatchOperation>,
  valuesTrusted: boolean,
): FastPatchSuccess | null {
  return applyFastPatchStrategies(state, ops, trustedStrategies, valuesTrusted);
}

export function applyAcceptedFastPatch(
  state: unknown,
  ops: ReadonlyArray<JSONPatchOperation>,
): FastPatchSuccess | null {
  return applyFastPatchStrategies(state, ops, acceptedStrategies, true);
}

function applyFastPatchStrategies(
  state: unknown,
  ops: ReadonlyArray<JSONPatchOperation>,
  strategies: readonly FastPatchStrategy[],
  valuesTrusted: boolean,
): FastPatchSuccess | null {
  const options: FastPatchStrategyOptions = { valuesTrusted };
  for (const strategy of strategies) {
    const candidate = strategy(state, ops, options);
    if (candidate.handled) return candidate;
  }
  return null;
}
