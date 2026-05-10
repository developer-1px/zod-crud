// API collection 도메인 schema. Postman/Insomnia 류 — folder 안에 folder 또는 request.
//
// 데모는 가상의 SaaS "Stacker" (팀 작업 관리) API 컬렉션을 다룬다.
// description·body 필드까지 갖춰 placeholder 가 아닌 *실제로 본 적 있는* API 모양.

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
  description: z.string(),
  body: z.string(), // raw JSON or "" if none
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

const JSON_HDR: Header = { key: "Content-Type", value: "application/json" };
const AUTH_HDR: Header = { key: "Authorization", value: "Bearer {{accessToken}}" };

const r = (
  name: string,
  method: Method,
  url: string,
  description: string,
  body = "",
  headers: Header[] = [AUTH_HDR],
): Request => ({ kind: "request", name, method, url, description, body, headers });

export const SAMPLE: Collection = {
  name: "Stacker API · 팀 작업 관리 SaaS",
  items: [
    {
      kind: "folder",
      name: "Auth",
      items: [
        r("로그인", "POST", "/v1/auth/login", "이메일·비밀번호로 access/refresh 토큰 발급",
          `{ "email": "alex@stacker.io", "password": "••••••••" }`,
          [JSON_HDR]),
        r("토큰 갱신", "POST", "/v1/auth/refresh", "refresh 토큰으로 새 access 토큰 발급",
          `{ "refreshToken": "{{refreshToken}}" }`,
          [JSON_HDR]),
        r("내 프로필", "GET", "/v1/auth/me", "현재 로그인 사용자 정보"),
        r("로그아웃", "POST", "/v1/auth/logout", "현재 세션의 refresh 토큰 폐기"),
      ],
    },
    {
      kind: "folder",
      name: "Workspaces",
      items: [
        r("워크스페이스 목록", "GET", "/v1/workspaces", "내가 속한 워크스페이스 전체"),
        r("워크스페이스 생성", "POST", "/v1/workspaces", "새 워크스페이스를 만든다 (소유자 = 호출자)",
          `{ "name": "Acme Inc.", "slug": "acme" }`,
          [AUTH_HDR, JSON_HDR]),
        r("워크스페이스 수정", "PATCH", "/v1/workspaces/:id", "이름·설정 변경 (관리자 권한)",
          `{ "name": "Acme Corp." }`,
          [AUTH_HDR, JSON_HDR]),
        r("워크스페이스 삭제", "DELETE", "/v1/workspaces/:id", "워크스페이스 영구 삭제 — 되돌릴 수 없음"),
      ],
    },
    {
      kind: "folder",
      name: "Projects",
      items: [
        r("프로젝트 목록", "GET", "/v1/workspaces/:wid/projects", "워크스페이스의 프로젝트 (?archived=true 옵션)"),
        r("프로젝트 생성", "POST", "/v1/workspaces/:wid/projects", "새 프로젝트 — 기본 칸반 보드 자동 생성",
          `{ "name": "2026 Q2 Launch", "color": "#f59e0b" }`,
          [AUTH_HDR, JSON_HDR]),
        r("프로젝트 보관", "PATCH", "/v1/projects/:id", "archived: true 로 토글",
          `{ "archived": true }`,
          [AUTH_HDR, JSON_HDR]),
        r("프로젝트 삭제", "DELETE", "/v1/projects/:id", "프로젝트 + 하위 task 영구 삭제"),
      ],
    },
    {
      kind: "folder",
      name: "Tasks",
      items: [
        r("태스크 목록", "GET", "/v1/projects/:pid/tasks", "프로젝트 안 task — ?status=todo 등 필터"),
        r("태스크 생성", "POST", "/v1/projects/:pid/tasks", "새 task 추가 (기본 status=todo)",
          `{ "title": "스키마 검토", "assigneeId": "u_abc", "dueDate": "2026-06-01" }`,
          [AUTH_HDR, JSON_HDR]),
        r("태스크 수정", "PATCH", "/v1/tasks/:id", "title·status·assignee·dueDate 부분 수정",
          `{ "status": "in_progress" }`,
          [AUTH_HDR, JSON_HDR]),
        r("태스크 삭제", "DELETE", "/v1/tasks/:id", "task 삭제 — 휴지통 30일"),
        {
          kind: "folder",
          name: "Comments",
          items: [
            r("댓글 목록", "GET", "/v1/tasks/:tid/comments", "최신순"),
            r("댓글 작성", "POST", "/v1/tasks/:tid/comments", "Markdown 본문",
              `{ "body": "이 부분 다시 봅시다 @alex" }`,
              [AUTH_HDR, JSON_HDR]),
            r("댓글 삭제", "DELETE", "/v1/comments/:id", "본인 또는 관리자만"),
          ],
        },
      ],
    },
    {
      kind: "folder",
      name: "Webhooks",
      items: [
        r("웹훅 목록", "GET", "/v1/workspaces/:wid/webhooks", "등록된 외부 콜백"),
        r("웹훅 등록", "POST", "/v1/workspaces/:wid/webhooks", "task.created · comment.added 등 이벤트 구독",
          `{ "url": "https://hooks.acme.com/stacker", "events": ["task.created", "task.updated"] }`,
          [AUTH_HDR, JSON_HDR]),
        r("웹훅 삭제", "DELETE", "/v1/webhooks/:id", "구독 해제"),
      ],
    },
  ],
};
