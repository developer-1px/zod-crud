import type { ZodError } from "zod";

import type { JsonChange, JsonPath, NodeId } from "../document/json-doc-types.js";

export type OperationFailureCode =
  | "clipboard_empty"
  | "duplicate_key"
  | "empty_selection"
  | "exception"
  | "invalid_target"
  | "missing_default"
  | "root_operation"
  | "schema_mismatch";

export type OperationResult =
  | {
      ok: true;
      /**
       * Primary node affected by a successful mutation.
       *
       * For create and insert paste this is the inserted subtree root.
       * For overwrite paste and update this is the target root.
       * For delete and cut this is the removed root.
       * For deleteMany this is the removed sibling used as the history focus
       * anchor.
       */
      nodeId?: NodeId;
      /**
       * Existing node that UIs should focus after the mutation.
       *
       * This is always a live node in the committed document.
       * For multi-value paste this is the last inserted root, while
       * `focusNodeIds` contains the whole pasted selection.
       */
      focusNodeId?: NodeId;
      /**
       * Existing nodes that UIs should select after a batch mutation.
       *
       * This is used when a single committed operation creates or restores
       * multiple peer roots, such as multi-value paste.
       */
      focusNodeIds?: NodeId[];
      /**
       * Changed JsonDoc nodes for this successful mutation.
       *
       * This contains only inserted, updated, and deleted nodes, not a full
       * document snapshot.
       */
      changes?: JsonChange[];
    }
  | {
      ok: false;
      code?: OperationFailureCode;
      reason: string;
      nodeId?: NodeId;
      path?: JsonPath;
      error?: ZodError;
    };
