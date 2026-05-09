import type { AdminWorkspace } from "./admin-workspace-schema.js";

export const initialAdminWorkspace: AdminWorkspace = {
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
