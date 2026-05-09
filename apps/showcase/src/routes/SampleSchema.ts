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
