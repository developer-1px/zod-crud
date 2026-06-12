import type {
  JSONDocument,
} from "@interactive-os/json-document";

import {
  resolveId,
} from "./resolve.js";
import {
  readCurrentSnapshot,
} from "./snapshot.js";
import type {
  IdResolver,
  IdResolverOptions,
} from "./types.js";

export function createIdResolver<T>(
  doc: JSONDocument<T>,
  options: IdResolverOptions,
): IdResolver {
  return {
    current: () => readCurrentSnapshot(doc, options.scopes),
    resolve(scope, id) {
      return resolveId(options.scopes, readCurrentSnapshot(doc, options.scopes), scope, id);
    },
  };
}
