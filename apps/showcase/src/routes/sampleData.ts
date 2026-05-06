import { z } from "zod";

export const SampleSchema = z.object({
  app: z.object({
    name: z.string(),
    version: z.string(),
    settings: z.object({
      theme: z.enum(["light", "dark", "system"]),
      language: z.enum(["ko", "en", "ja"]),
      notifications: z.object({
        email: z.boolean(),
        push: z.boolean(),
        sms: z.boolean(),
      }),
    }),
  }),
  users: z.array(
    z.object({
      id: z.number(),
      name: z.string(),
      role: z.enum(["admin", "editor", "viewer"]),
      tags: z.array(z.string()),
      profile: z.object({
        bio: z.string(),
        location: z.string(),
        verified: z.boolean(),
      }),
    }),
  ),
  projects: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      tasks: z.array(
        z.object({
          id: z.string(),
          title: z.string(),
          done: z.boolean(),
          priority: z.enum(["low", "medium", "high"]),
        }),
      ),
    }),
  ),
});

export const sampleData: z.infer<typeof SampleSchema> = {
  app: {
    name: "zod-crud showcase",
    version: "0.1.0",
    settings: {
      theme: "dark",
      language: "ko",
      notifications: { email: true, push: false, sms: false },
    },
  },
  users: [
    {
      id: 1,
      name: "Alice Kim",
      role: "admin",
      tags: ["founder", "engineering"],
      profile: { bio: "Building things.", location: "Seoul", verified: true },
    },
    {
      id: 2,
      name: "Bob Lee",
      role: "editor",
      tags: ["content", "design"],
      profile: { bio: "Writes and ships.", location: "Busan", verified: true },
    },
    {
      id: 3,
      name: "Carol Park",
      role: "viewer",
      tags: ["beta"],
      profile: { bio: "Observer.", location: "Daegu", verified: false },
    },
    {
      id: 4,
      name: "David Choi",
      role: "editor",
      tags: ["ops", "infra"],
      profile: { bio: "Keeps it running.", location: "Incheon", verified: true },
    },
  ],
  projects: [
    {
      id: "p-alpha",
      title: "Alpha launch",
      tasks: [
        { id: "t1", title: "Wireframes", done: true, priority: "high" },
        { id: "t2", title: "API contract", done: true, priority: "high" },
        { id: "t3", title: "Auth flow", done: false, priority: "high" },
        { id: "t4", title: "Onboarding", done: false, priority: "medium" },
        { id: "t5", title: "Analytics", done: false, priority: "low" },
      ],
    },
    {
      id: "p-beta",
      title: "Beta features",
      tasks: [
        { id: "t6", title: "Dark mode", done: true, priority: "medium" },
        { id: "t7", title: "i18n", done: false, priority: "medium" },
        { id: "t8", title: "Mobile layout", done: false, priority: "high" },
      ],
    },
    {
      id: "p-gamma",
      title: "Tech debt",
      tasks: [
        { id: "t9", title: "Refactor router", done: false, priority: "low" },
        { id: "t10", title: "Upgrade deps", done: true, priority: "low" },
      ],
    },
  ],
};
