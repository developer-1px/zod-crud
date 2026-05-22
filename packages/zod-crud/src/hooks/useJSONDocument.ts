// SPEC §5.9 — React facade over the headless createJSONDocument surface.

import { useMemo, useReducer, useRef } from "react";
import type * as z from "zod";

import {
  createJSONDocument,
  type JSONDocument,
  type UseJSONDocumentOptions,
} from "../createJSONDocument.js";

export function useJSONDocument<S extends z.ZodType>(
  schema: S,
  initial: z.input<S>,
  options: UseJSONDocumentOptions = {},
): JSONDocument<z.output<S>> {
  const [, force] = useReducer((version: number) => version + 1, 0);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  return useMemo(
    () => {
      const documentOptions: UseJSONDocumentOptions = {
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
