import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
} from "@tanstack/react-router";
import { Playground } from "./routes/Playground";
import { OutlinerPage } from "./routes/Outliner";
import { MobileCmsPage } from "./routes/MobileCms";
import { ApiCollectionPage } from "./routes/ApiCollection";

type NavItem = { to: string; label: string };
type NavGroup = { title: string; items: NavItem[] };

const NAV: NavGroup[] = [
  {
    title: "Playground",
    items: [
      { to: "/playground", label: "Core" },
      { to: "/playground/outliner", label: "Outliner" },
      { to: "/playground/mobile-cms", label: "Mobile CMS" },
      { to: "/playground/api-collection", label: "API collection" },
    ],
  },
];

function Nav() {
  return (
    <nav
      aria-label="Site navigation"
      className="shrink-0 border-stone-200 text-sm border-b md:border-b-0 md:border-r md:h-screen md:w-52 md:overflow-y-auto"
    >
      <Link to="/" className="block px-4 py-3 font-mono text-stone-900 hover:bg-stone-100">
        zod-crud
      </Link>
      {NAV.map((g) => (
        <div key={g.title} className="px-2 pb-3">
          <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-stone-400">
            {g.title}
          </div>
          {g.items.map((it) => (
            <Link
              key={it.to}
              to={it.to as never}
              className="block px-2 py-1 text-stone-700 no-underline hover:bg-stone-100 hover:text-stone-900 aria-[current=page]:bg-stone-900 aria-[current=page]:text-stone-50"
              activeOptions={{ exact: true }}
              activeProps={{ "aria-current": "page" }}
            >
              {it.label}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}

const rootRoute = createRootRoute({
  component: () => (
    <div className="flex w-screen flex-col md:h-screen md:flex-row md:overflow-hidden">
      <Nav />
      <div className="flex-1 md:overflow-auto">
        <Outlet />
      </div>
    </div>
  ),
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: Playground,
});

const playgroundRoute = createRoute({ getParentRoute: () => rootRoute, path: "/playground", component: Playground });
const outlinerRoute = createRoute({ getParentRoute: () => rootRoute, path: "/playground/outliner", component: OutlinerPage });
const mobileCmsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/playground/mobile-cms", component: MobileCmsPage });
const apiCollectionRoute = createRoute({ getParentRoute: () => rootRoute, path: "/playground/api-collection", component: ApiCollectionPage });

const routeTree = rootRoute.addChildren([
  indexRoute,
  playgroundRoute,
  outlinerRoute,
  mobileCmsRoute,
  apiCollectionRoute,
]);

export const router = createRouter({
  routeTree,
  basepath: import.meta.env.BASE_URL.replace(/\/$/, "") || "/",
});

declare module "@tanstack/react-router" {
  interface Register { router: typeof router }
}
