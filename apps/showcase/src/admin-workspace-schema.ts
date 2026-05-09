import * as z from "zod";

export type AdminUser = {
  name: string;
  email: string;
  role: "owner" | "admin" | "viewer";
  active: boolean;
  quota: number;
  tags: string[];
};

export type AdminTask = {
  title: string;
  status: "todo" | "doing" | "done" | "blocked";
  estimate: number;
};

export type AdminWorkspace = {
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

export const AdminWorkspaceSchema: z.ZodType<AdminWorkspace> = z.object({
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
