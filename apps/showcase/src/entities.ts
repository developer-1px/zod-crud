import * as z from "zod";

import {
  createJsonCrud,
  type JsonCrud,
  type JsonPath,
  type JsonValue,
} from "zod-crud";

type AdminUser = {
  name: string;
  email: string;
  role: "owner" | "admin" | "viewer";
  active: boolean;
  quota: number;
  tags: string[];
};

type AdminTask = {
  title: string;
  status: "todo" | "doing" | "done" | "blocked";
  estimate: number;
};

type AdminWorkspace = {
  workspace: {
    name: string;
    status: "trial" | "active" | "suspended";
    billingTier: "free" | "team" | "enterprise";
  };
  settings: {
    auditLog: boolean;
    refreshSeconds: number;
    region: "ap-northeast-2" | "us-east-1" | "eu-west-1";
  };
  users: AdminUser[];
  tasks: AdminTask[];
  tags: string[];
};

type MenuItem = {
  label: string;
  url: string;
  visible: boolean;
  children: MenuItem[];
};

export type EntityDefinition = {
  id: string;
  label: string;
  schemaName: string;
  schema: z.ZodType<JsonValue, unknown>;
  initialValue: JsonValue;
  childKeys: string[];
  defaultValue: (parentPath: JsonPath, index: number) => JsonValue;
};

const AdminUserSchema = z.object({
  name: z.string().min(2, "Name must contain at least 2 characters."),
  email: z.string().email("Email must be a valid address."),
  role: z.union([z.literal("owner"), z.literal("admin"), z.literal("viewer")]),
  active: z.boolean(),
  quota: z.number().int("Quota must be an integer.").min(0).max(100),
  tags: z.array(z.string().min(1, "Tags cannot be empty.")),
});

const AdminTaskSchema = z.object({
  title: z.string().min(1, "Task title is required."),
  status: z.union([
    z.literal("todo"),
    z.literal("doing"),
    z.literal("done"),
    z.literal("blocked"),
  ]),
  estimate: z.number().int("Estimate must be an integer.").min(1).max(40),
});

const AdminWorkspaceSchema: z.ZodType<AdminWorkspace> = z.object({
  workspace: z.object({
    name: z.string().min(3, "Workspace name must contain at least 3 characters."),
    status: z.union([z.literal("trial"), z.literal("active"), z.literal("suspended")]),
    billingTier: z.union([z.literal("free"), z.literal("team"), z.literal("enterprise")]),
  }),
  settings: z.object({
    auditLog: z.boolean(),
    refreshSeconds: z.number().int().min(5).max(300),
    region: z.union([
      z.literal("ap-northeast-2"),
      z.literal("us-east-1"),
      z.literal("eu-west-1"),
    ]),
  }),
  users: z.array(AdminUserSchema).min(1),
  tasks: z.array(AdminTaskSchema),
  tags: z.array(z.string().min(1)),
});

const MenuItemSchema: z.ZodType<MenuItem> = z.lazy(() =>
  z.object({
    label: z.string().min(1),
    url: z.string().startsWith("/"),
    visible: z.boolean(),
    children: z.array(MenuItemSchema),
  }),
);

const initialAdminWorkspace: AdminWorkspace = {
  workspace: {
    name: "Ops Control",
    status: "active",
    billingTier: "team",
  },
  settings: {
    auditLog: true,
    refreshSeconds: 30,
    region: "ap-northeast-2",
  },
  users: [
    {
      name: "Ari Kim",
      email: "ari@example.com",
      role: "owner",
      active: true,
      quota: 80,
      tags: ["ops", "priority"],
    },
    {
      name: "Bea Park",
      email: "bea@example.com",
      role: "admin",
      active: true,
      quota: 55,
      tags: ["support"],
    },
    {
      name: "Cy Lee",
      email: "cy@example.com",
      role: "viewer",
      active: false,
      quota: 15,
      tags: ["audit"],
    },
  ],
  tasks: [
    {
      title: "Review access policy",
      status: "doing",
      estimate: 8,
    },
    {
      title: "Archive stale seats",
      status: "todo",
      estimate: 3,
    },
  ],
  tags: ["admin", "billing", "audit"],
};

const initialMenu: MenuItem = {
  label: "Root",
  url: "/",
  visible: true,
  children: [
    {
      label: "Dashboard",
      url: "/dashboard",
      visible: true,
      children: [],
    },
    {
      label: "Settings",
      url: "/settings",
      visible: true,
      children: [
        {
          label: "Members",
          url: "/settings/members",
          visible: true,
          children: [],
        },
      ],
    },
  ],
};

export const entityDefinitions = [
  registerEntity({
    id: "admin-workspace",
    label: "Admin workspace",
    schemaName: "AdminWorkspaceSchema",
    schema: AdminWorkspaceSchema,
    initialValue: initialAdminWorkspace,
    childKeys: ["users", "tasks", "tags"],
    defaultValue: (parentPath, index) => {
      const parentKey = parentPath[parentPath.length - 1];

      if (parentKey === "users") {
        return {
          name: `User ${index}`,
          email: `user${index}@example.com`,
          role: "viewer",
          active: true,
          quota: 10,
          tags: [],
        };
      }

      if (parentKey === "tasks") {
        return {
          title: `Task ${index}`,
          status: "todo",
          estimate: 1,
        };
      }

      return `tag-${index}`;
    },
  }),
  registerEntity({
    id: "menu-tree",
    label: "Menu tree",
    schemaName: "MenuItemSchema",
    schema: MenuItemSchema,
    initialValue: initialMenu,
    childKeys: ["children"],
    defaultValue: (_parentPath, index) => ({
      label: `Item ${index}`,
      url: `/item-${index}`,
      visible: true,
      children: [],
    }),
  }),
] satisfies EntityDefinition[];

export const defaultEntityId = entityDefinitions[0]?.id ?? "";

export function makeEditor(entity: EntityDefinition): JsonCrud<JsonValue> {
  let nextItemIndex = 1;

  return createJsonCrud(entity.schema, entity.initialValue, {
    childKeys: entity.childKeys,
    defaultFor: (parentPath) => entity.defaultValue(parentPath, nextItemIndex++),
  });
}

export function makeEditorFromValue(entity: EntityDefinition, value: JsonValue): JsonCrud<JsonValue> {
  let nextItemIndex = 1;

  return createJsonCrud(entity.schema, value, {
    childKeys: entity.childKeys,
    defaultFor: (parentPath) => entity.defaultValue(parentPath, nextItemIndex++),
  });
}

export function entityById(entityId: string): EntityDefinition {
  return entityDefinitions.find((entity) => entity.id === entityId) ?? entityDefinitions[0]!;
}

function registerEntity<T extends JsonValue>(definition: {
  id: string;
  label: string;
  schemaName: string;
  schema: z.ZodType<T, unknown>;
  initialValue: T;
  childKeys: string[];
  defaultValue: (parentPath: JsonPath, index: number) => JsonValue;
}): EntityDefinition {
  return definition as unknown as EntityDefinition;
}
