import type { NodeId } from "zod-crud";

import type { EnumValueOption } from "./schema-options.js";

export type InlineEditState = {
  nodeId: NodeId;
  draft: string;
  invalid: boolean;
  options: EnumValueOption[];
};

export type InlineStatus = {
  nodeId: NodeId;
  kind: "idle" | "valid" | "invalid";
  message: string;
};
