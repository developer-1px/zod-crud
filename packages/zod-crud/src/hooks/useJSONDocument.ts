// SPEC §5.10 — React facade over the headless createJSONDocument surface.

import { useMemo, useReducer, useRef } from "react";
import type * as z from "zod";

import {
  createJSONDocument,
  type JSONDocument,
  type JSONDocumentHistory,
  type UseJSONDocumentOptions,
} from "../createJSONDocument.js";
import type { JSONCrudError } from "../JSONCrudError.js";

export type {
  JSONDocument,
  JSONDocumentHistory,
  UseJSONDocumentOptions,
};
export type { JSONCrudError };

export function useJSONDocument<S extends z.ZodType>(
  schema: S,
  initial: z.input<S>,
  options: UseJSONDocumentOptions<z.output<S>> = {},
): JSONDocument<z.output<S>> {
  const [, force] = useReducer((version: number) => version + 1, 0);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  return useMemo(
    () => {
      const documentOptions: UseJSONDocumentOptions<z.output<S>> = {
        get strict() { return optionsRef.current.strict; },
        onError(error) { optionsRef.current.onError?.(error); },
        onChange: force,
      };
      if (options.history !== undefined) documentOptions.history = options.history;
      if (options.selection !== undefined) documentOptions.selection = options.selection;
      return createJSONDocument(schema, initial, documentOptions);
    },
    [schema],
  );
}
