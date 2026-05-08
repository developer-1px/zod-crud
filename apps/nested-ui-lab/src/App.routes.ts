export type ViewMode = "treegrid" | "outline" | "cards";

export const routes: Array<{ path: string; mode: ViewMode; label: string }> = [
  { path: "/treegrid", mode: "treegrid", label: "TreeGrid" },
  { path: "/outline", mode: "outline", label: "Outline" },
  { path: "/cards", mode: "cards", label: "Cards" },
];

export function routeForPath(pathname: string): (typeof routes)[number] {
  return routes.find((route) => route.path === pathname) ?? routes[0]!;
}
