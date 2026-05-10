// API collection 도메인 schema. Postman/Insomnia 류 — folder 안에 folder 또는 request.
//
// zod-crud 시연 핵심:
// - 임의 깊이 트리 (folder 재귀)
// - method 같은 차원으로 JSONPath bulk select 가능 ($..requests[?(@.method=='POST')])
// - request 단위 클립보드 (서로 다른 폴더 사이 복사)
// - Zod 가 url·method 형태를 검증

import { z } from "zod";

export const Method = z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]);
export type Method = z.infer<typeof Method>;

export const Header = z.object({
  key: z.string(),
  value: z.string(),
});
export type Header = z.infer<typeof Header>;

export const Request = z.object({
  kind: z.literal("request"),
  name: z.string(),
  method: Method,
  url: z.string(),
  headers: z.array(Header),
});
export type Request = z.infer<typeof Request>;

export type Folder = {
  kind: "folder";
  name: string;
  items: Array<Folder | Request>;
};

export const Folder: z.ZodType<Folder> = z.object({
  kind: z.literal("folder"),
  name: z.string(),
  get items() {
    return z.array(z.union([Folder, Request]));
  },
});

export const Item = z.union([Folder, Request]);
export type Item = z.infer<typeof Item>;

export const Collection = z.object({
  name: z.string(),
  items: z.array(Item),
});
export type Collection = z.infer<typeof Collection>;

export const SAMPLE: Collection = {
  name: "Acme API",
  items: [
    {
      kind: "folder",
      name: "Auth",
      items: [
        { kind: "request", name: "Login", method: "POST", url: "/auth/login", headers: [{ key: "Content-Type", value: "application/json" }] },
        { kind: "request", name: "Refresh", method: "POST", url: "/auth/refresh", headers: [] },
        { kind: "request", name: "Me", method: "GET", url: "/auth/me", headers: [{ key: "Authorization", value: "Bearer {{token}}" }] },
      ],
    },
    {
      kind: "folder",
      name: "Users",
      items: [
        { kind: "request", name: "List", method: "GET", url: "/users", headers: [] },
        { kind: "request", name: "Create", method: "POST", url: "/users", headers: [{ key: "Content-Type", value: "application/json" }] },
        { kind: "request", name: "Update", method: "PATCH", url: "/users/:id", headers: [] },
        { kind: "request", name: "Delete", method: "DELETE", url: "/users/:id", headers: [] },
      ],
    },
    {
      kind: "folder",
      name: "Billing",
      items: [
        {
          kind: "folder",
          name: "Subscriptions",
          items: [
            { kind: "request", name: "Subscribe", method: "POST", url: "/billing/subscriptions", headers: [] },
            { kind: "request", name: "Cancel", method: "DELETE", url: "/billing/subscriptions/:id", headers: [] },
          ],
        },
        { kind: "request", name: "Invoices", method: "GET", url: "/billing/invoices", headers: [] },
      ],
    },
  ],
};
