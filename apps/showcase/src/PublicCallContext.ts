import type {
  JsonCrud,
  JsonDoc,
  JsonValue,
  NodeId,
} from "zod-crud";

export type PublicCallContext = {
  createEditor: () => {
    entity: string;
    snapshot: JsonDoc;
  };
  editor: JsonCrud<JsonValue>;
  jsonValue: JsonValue;
  targetId: NodeId;
  targetIds: NodeId[];
  toggleSubscribe: () => { ok: true; subscribed: boolean; events: number };
};
