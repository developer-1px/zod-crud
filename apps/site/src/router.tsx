import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from "@tanstack/react-router";
import { SidebarNav } from "./nav/SidebarNav";
import { Landing } from "./routes/Landing";
import { ApiReference } from "./routes/ApiReference";
import { Examples } from "./routes/Examples";
import { MarkdownDocPage } from "./docs/MarkdownDocPage";
import { docsPagesBySlug, type DocsPage } from "./docs/docs-pages";

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
  component: () => <MarkdownDocPage page={docsPagesBySlug.intro} />,
  staticData: { palette: docPalette(docsPagesBySlug.intro) },
});

const gettingStartedRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/docs/getting-started",
  component: () => <MarkdownDocPage page={docsPagesBySlug["getting-started"]} />,
  staticData: { palette: docPalette(docsPagesBySlug["getting-started"]) },
});

const conceptsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/docs/concepts",
  component: () => <MarkdownDocPage page={docsPagesBySlug.concepts} />,
  staticData: { palette: docPalette(docsPagesBySlug.concepts) },
});

const schemaSafetyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/docs/schema-safety",
  component: () => <MarkdownDocPage page={docsPagesBySlug["schema-safety"]} />,
  staticData: { palette: docPalette(docsPagesBySlug["schema-safety"]) },
});

const operationsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/docs/operations",
  component: () => <MarkdownDocPage page={docsPagesBySlug.operations} />,
  staticData: { palette: docPalette(docsPagesBySlug.operations) },
});

const clipboardHistoryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/docs/clipboard-history",
  component: () => <MarkdownDocPage page={docsPagesBySlug["clipboard-history"]} />,
  staticData: { palette: docPalette(docsPagesBySlug["clipboard-history"]) },
});

const examplesGuideRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/docs/examples",
  component: () => <MarkdownDocPage page={docsPagesBySlug.examples} />,
  staticData: { palette: docPalette(docsPagesBySlug.examples) },
});

const advancedRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/docs/advanced",
  component: () => <MarkdownDocPage page={docsPagesBySlug.advanced} />,
  staticData: { palette: docPalette(docsPagesBySlug.advanced) },
});

const apiRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/api",
  component: ApiReference,
  staticData: { palette: { label: "API reference", to: "/api", category: "Reference", order: 20 } },
});

const examplesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/examples",
  component: Examples,
  staticData: { palette: { label: "Examples", to: "/examples", category: "Reference", order: 21 } },
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  introRoute,
  gettingStartedRoute,
  conceptsRoute,
  schemaSafetyRoute,
  operationsRoute,
  clipboardHistoryRoute,
  examplesGuideRoute,
  advancedRoute,
  apiRoute,
  examplesRoute,
]);

export const router = createRouter({
  routeTree,
  basepath: import.meta.env.BASE_URL.replace(/\/$/, "") || "/",
});

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

function docPalette(page: DocsPage) {
  return {
    label: page.navLabel,
    to: page.route,
    category: "Docs",
    order: page.order,
  };
}
