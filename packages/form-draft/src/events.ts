import {
  copySnapshot,
} from "./snapshot.js";
import type {
  FormDraftListener,
  FormDraftSnapshot,
} from "./types.js";

export function emit<TInput>(
  listeners: Set<FormDraftListener<TInput>>,
  snapshot: FormDraftSnapshot<TInput>,
): void {
  const event = copySnapshot(snapshot);
  for (const listener of [...listeners]) {
    listener(event);
  }
}
