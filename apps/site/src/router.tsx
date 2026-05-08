import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from "@tanstack/react-router";
import { SidebarNav } from "./nav/SidebarNav";
import { Landing } from "./routes/Landing";
import { Intro } from "./routes/Intro";
import { Concepts } from "./routes/Concepts";
import { GettingStarted } from "./routes/GettingStarted";
import { ApiReference } from "./routes/ApiReference";
import { Examples } from "./routes/Examples";

const rootRoute = createRootRoute({
  component: () => (
    <div className="flex w-screen flex-col md:h-screen md:flex-row md:overflow-hidden">
      <SidebarNav />
      <div className="flex-1 md:overflow-auto">
        <Outlet />
      </div>
    </div>
  ),
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: Landing,
  staticData: { palette: { label: "Overview", to: "/", category: "Start", order: 0 } },
});

const introRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/docs/intro",
  component: Intro,
  staticData: { palette: { label: "What is zod-crud?", to: "/docs/intro", category: "Docs", order: 1 } },
});

const gettingStartedRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/docs/getting-started",
  component: GettingStarted,
  staticData: { palette: { label: "Getting started", to: "/docs/getting-started", category: "Docs", order: 2 } },
});

const conceptsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/docs/concepts",
  component: Concepts,
  staticData: { palette: { label: "Concepts", to: "/docs/concepts", category: "Docs", order: 3 } },
});

const apiRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/api",
  component: ApiReference,
  staticData: { palette: { label: "API reference", to: "/api", category: "Reference", order: 4 } },
});

const examplesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/examples",
  component: Examples,
  staticData: { palette: { label: "Examples", to: "/examples", category: "Reference", order: 5 } },
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  introRoute,
  gettingStartedRoute,
  conceptsRoute,
  apiRoute,
  examplesRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register { router: typeof router }
  interface StaticDataRouteOption {
    palette?: {
      label: string;
      to: string;
      params?: Record<string, string>;
      category?: string;
      sub?: string;
      order?: number;
    };
  }
}
