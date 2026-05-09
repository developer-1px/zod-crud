import type {
  JsonNode,
  JsonValue,
  NodeId,
  PasteMode,
} from "zod-crud";

import type { ApiId } from "./api-catalog.js";
import type { ApiRun } from "./ApiRun.js";
import type { UpdatePreview } from "./command-inputs.js";
import type { EnumValueOption } from "./schema-options.js";

export type ApiWorkbenchProps = {
  activeApi: ApiId;
  activeEntityId: string;
  keyDraft: string;
  findKeyDraft: string;
  jsonValue: JsonValue;
  jsonValueDraft: string;
  lastRun: ApiRun;
  pasteIndexDraft: string;
  pasteMode: PasteMode;
  selectedIds: NodeId[];
  selectedNode: JsonNode | undefined;
  selectedPath: string;
  subscriptionEvents: number;
  updatePreview: UpdatePreview;
  valueDraft: string;
  valueOptions: EnumValueOption[];
  onEntitySelect: (entityId: string) => void;
  onFindKeyDraft: (value: string) => void;
  onJsonValueDraft: (value: string) => void;
  onKeyDraft: (value: string) => void;
  onPasteIndexDraft: (value: string) => void;
  onPasteMode: (value: PasteMode) => void;
  onRun: () => void;
  onValueDraft: (value: string) => void;
};
