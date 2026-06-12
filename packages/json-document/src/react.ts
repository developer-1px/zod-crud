// SPEC §5.9 — React facade over the headless createJSONDocument surface.

import { useMemo, useReducer, useRef } from "react";
import type * as z from "zod";

import { createJSONDocument } from "./application/document/create.js";
import type {
  JSONDocument,
  JSONDocumentOptions,
} from "./application/document/interface.js";

type TrustedInitialDocumentOptions = JSONDocumentOptions & { trustedInitial: true };
type UntrustedInitialDocumentOptions = JSONDocumentOptions & { trustedInitial?: false | undefined };

export function useJSONDocument<S extends z.ZodType>(
  schema: S,
  initial: z.output<S>,
  options: TrustedInitialDocumentOptions,
): JSONDocument<z.output<S>>;
export function useJSONDocument<S extends z.ZodType>(
  schema: S,
  initial: z.input<S>,
  options?: UntrustedInitialDocumentOptions,
): JSONDocument<z.output<S>>;
export function useJSONDocument<S extends z.ZodType>(
  schema: S,
  initial: z.input<S> | z.output<S>,
  options: JSONDocumentOptions = {},
): JSONDocument<z.output<S>> {
  const [, force] = useReducer((version: number) => version + 1, 0);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  return useMemo(
    () => {
      const documentOptions: UntrustedInitialDocumentOptions = {
        get strict() { return optionsRef.current.strict; },
        onError(error) { optionsRef.current.onError?.(error); },
        onChange: force,
      };
      if (options.history !== undefined) documentOptions.history = options.history;
      if (options.selection !== undefined) documentOptions.selection = options.selection;
      if (options.trustedInitial === true) {
        return createJSONDocument(schema, initial as z.output<S>, {
          ...documentOptions,
          trustedInitial: true,
        });
      }
      return createJSONDocument(schema, initial as z.input<S>, documentOptions);
    },
    [schema],
  );
}
