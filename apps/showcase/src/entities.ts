import * as z from "zod";

import {
  createJsonCrud,
  type JsonNode,
  type JsonValue,
} from "zod-crud";

type CommandNode = {
  title: string;
  status: "draft" | "active" | "done";
  children: CommandNode[];
};

type CustomerDirectory = {
  team: string;
  contacts: Array<{
    name: string;
    email: string;
    tags: string[];
  }>;
};

export type EntityDefinition = {
  id: string;
  label: string;
  schemaName: string;
  description: string;
  schema: z.ZodType<JsonValue, unknown>;
  initialValue: JsonValue;
  childKeys: string[];
  schemaSource: string;
  createValue: (parent: JsonNode, index: number) => JsonValue;
};

const CommandNodeSchema: z.ZodType<CommandNode> = z.lazy(() =>
  z.object({
    title: z.string().min(1),
    status: z.union([z.literal("draft"), z.literal("active"), z.literal("done")]),
    children: z.array(CommandNodeSchema),
  }),
);

const CustomerDirectorySchema = z.object({
  team: z.string().min(1),
  contacts: z.array(z.object({
    name: z.string().min(1),
    email: z.string().email(),
    tags: z.array(z.string().min(1)),
  })),
});

const initialCommandDocument: CommandNode = {
  title: "Command document",
  status: "active",
  children: [
    {
      title: "Copy source",
      status: "draft",
      children: [
        { title: "Nested child", status: "done", children: [] },
      ],
    },
    { title: "Paste target", status: "active", children: [] },
    { title: "Delete candidate", status: "draft", children: [] },
  ],
};

const initialCustomerDirectory: CustomerDirectory = {
  team: "Field operations",
  contacts: [
    {
      name: "Ari Kim",
      email: "ari@example.com",
      tags: ["buyer", "priority"],
    },
    {
      name: "Bea Park",
      email: "bea@example.com",
      tags: ["ops"],
    },
  ],
};

export const entityDefinitions = [
  registerEntity({
    id: "command-tree",
    label: "Command tree",
    schemaName: "CommandNodeSchema",
    description: "Recursive tree entity used for copy, cut, paste, delete, undo, and redo.",
    schema: CommandNodeSchema,
    initialValue: initialCommandDocument,
    childKeys: ["children"],
    schemaSource: `const CommandNodeSchema = z.lazy(() =>
  z.object({
    title: z.string().min(1),
    status: z.union([
      z.literal("draft"),
      z.literal("active"),
      z.literal("done"),
    ]),
    children: z.array(CommandNodeSchema),
  }),
);`,
    createValue: (_parent, index) => ({
      title: `New child ${index}`,
      status: "draft",
      children: [],
    }),
  }),
  registerEntity({
    id: "customer-directory",
    label: "Customer directory",
    schemaName: "CustomerDirectorySchema",
    description: "Zod object entity with contacts and nested tag arrays.",
    schema: CustomerDirectorySchema,
    initialValue: initialCustomerDirectory,
    childKeys: ["contacts", "tags"],
    schemaSource: `const CustomerDirectorySchema = z.object({
  team: z.string().min(1),
  contacts: z.array(z.object({
    name: z.string().min(1),
    email: z.string().email(),
    tags: z.array(z.string().min(1)),
  })),
});`,
    createValue: (parent, index) => parent.key === "tags"
      ? `tag-${index}`
      : {
          name: `New contact ${index}`,
          email: `contact${index}@example.com`,
          tags: [],
        },
  }),
] satisfies EntityDefinition[];

export const defaultEntityId = entityDefinitions[0]?.id ?? "";

export function makeEditor(entity: EntityDefinition) {
  return createJsonCrud(entity.schema, entity.initialValue, { childKeys: entity.childKeys });
}

export function makeEditors() {
  return Object.fromEntries(entityDefinitions.map((entity) => [entity.id, makeEditor(entity)]));
}

export function entityById(entityId: string): EntityDefinition {
  return entityDefinitions.find((entity) => entity.id === entityId) ?? entityDefinitions[0]!;
}

function registerEntity<T extends JsonValue>(definition: {
  id: string;
  label: string;
  schemaName: string;
  description: string;
  schema: z.ZodType<T, unknown>;
  initialValue: T;
  childKeys: string[];
  schemaSource: string;
  createValue: (parent: JsonNode, index: number) => JsonValue;
}): EntityDefinition {
  return definition as unknown as EntityDefinition;
}
