// SPEC.md §5.1 — low-level React facade.
// React facade over the headless createJSON state owner.
// undo/redo 는 JSONOps 의 책임이 아님 — doc.commands.undo / doc.can.undo / doc.history 가 정본 위치.

import { useEffect, useMemo, useReducer, useRef } from "react";
import type * as z from "zod";

import {
  createJSON,
  type CreateJSONOptions,
  type HeadlessJSONState,
  type JSONState,
} from "../createJSON.js";
import type { JSONChangeMetadata, JSONOps, UseJSONOptions, JSONChangeListener } from "../jsonOps.js";

export { JSONCrudError } from "../JSONCrudError.js";
export type {
  CreateJSONOptions,
  HeadlessJSONState,
  JSONChangeListener,
  JSONChangeMetadata,
  JSONOps,
  JSONState,
  UseJSONOptions,
};

export function useJSON<S extends z.ZodType>(
  schema: S,
  initial: z.input<S>,
  options: UseJSONOptions = {},
): [z.output<S>, JSONOps<z.output<S>>] {
  const [, force] = useReducer((n: number) => n + 1, 0);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const json = useMemo(
    () => createJSON(schema, initial, {
      get strict() { return optionsRef.current.strict; },
      onError(error) { optionsRef.current.onError?.(error); },
      onChange: force,
    }),
    [schema],
  );

  useEffect(() => () => json.dispose(), [json]);

  return [json.value, json.ops];
}
