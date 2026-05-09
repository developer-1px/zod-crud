import { AdminWorkspaceSchema } from "./admin-workspace-schema.js";
import { defaultAdminWorkspaceValue } from "./default-admin-workspace-value.js";
import { defineEntity } from "./entity-definition.js";
import { initialAdminWorkspace } from "./initial-admin-workspace.js";

export const adminWorkspaceEntity = defineEntity({
  id: "admin-workspace",
  label: "Admin workspace",
  schemaName: "AdminWorkspaceSchema",
  schema: AdminWorkspaceSchema,
  initialValue: initialAdminWorkspace,
  childKeys: ["users", "tasks", "tags"],
  defaultValue: defaultAdminWorkspaceValue,
});
