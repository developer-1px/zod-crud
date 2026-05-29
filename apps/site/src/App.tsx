import { lazy, Suspense, type ComponentType, type MouseEvent, useEffect, useSyncExternalStore } from "react";
import { Home } from "./routes/Home";
import siteRoutes from "./site-routes.json";

type SiteRoute = {
  path: string;
  label: string;
  title: string;
  description: string;
  group: "Start" | "Demos";
};
type Route = SiteRoute & { Component: ComponentType };

const BASE_PATH = import.meta.env.BASE_URL.replace(/\/$/, "");
const SITE_URL = (import.meta.env.VITE_SITE_URL ?? "https://developer-1px.github.io/zod-crud").replace(/\/$/, "");
const Docs = lazy(() => import("./routes/Docs").then((module) => ({ default: module.Docs })));
const DocsTutorial = lazy(() => import("./routes/Docs").then((module) => ({ default: module.DocsTutorial })));
const DocsApiReference = lazy(() => import("./routes/Docs").then((module) => ({ default: module.DocsApiReference })));
const DocsExtensions = lazy(() => import("./routes/Docs").then((module) => ({ default: module.DocsExtensions })));
const DocsRecipes = lazy(() => import("./routes/Docs").then((module) => ({ default: module.DocsRecipes })));
const Playground = lazy(() => import("./routes/Playground").then((module) => ({ default: module.Playground })));
const Outliner = lazy(() => import("@zod-crud/outliner").then((module) => ({ default: module.Outliner })));
const MobileCms = lazy(() => import("@zod-crud/mobile-cms").then((module) => ({ default: module.App })));
const routeComponents: Record<string, ComponentType> = {
  "/": Home,
  "/docs": Docs,
  "/docs/tutorial": DocsTutorial,
  "/docs/api": DocsApiReference,
  "/docs/extensions": DocsExtensions,
  "/docs/recipes": DocsRecipes,
  "/playground": Playground,
  "/playground/outliner": Outliner,
  "/playground/mobile-cms": MobileCms,
};
const ROUTES: Route[] = (siteRoutes as SiteRoute[]).map((route) => ({
  ...route,
  Component: routeComponent(route.path),
}));

function routeComponent(path: string): ComponentType {
  const Component = routeComponents[path];
  if (!Component) throw new Error(`Missing site route component for ${path}.`);
  return Component;
}

function pathWithBase(path: string): string {
  return `${BASE_PATH}${path}` || "/";
}

function stripBase(pathname: string): string {
  if (BASE_PATH === "") return pathname;
  if (pathname === BASE_PATH) return "/";
  if (pathname.startsWith(`${BASE_PATH}/`)) return pathname.slice(BASE_PATH.length);
  return pathname;
}

function readPathname(): string {
  return normalizePath(stripBase(window.location.pathname) || "/");
}

function subscribePathname(listener: () => void): () => void {
  window.addEventListener("popstate", listener);
  return () => window.removeEventListener("popstate", listener);
}

function navigate(path: string): void {
  window.history.pushState(null, "", pathWithBase(path));
  window.scrollTo({ left: 0, top: 0 });
  window.dispatchEvent(new Event("popstate"));
}

function canonicalUrl(path: string): string {
  return path === "/" ? `${SITE_URL}/` : `${SITE_URL}${path}`;
}

function setMetaContent(selector: string, attribute: "name" | "property", key: string, content: string): void {
  let meta = document.head.querySelector<HTMLMetaElement>(selector);
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute(attribute, key);
    document.head.append(meta);
  }
  meta.setAttribute("content", content);
}

function setRouteMetadata(route: Route): void {
  const url = canonicalUrl(route.path);
  document.title = route.title;
  setMetaContent('meta[name="description"]', "name", "description", route.description);
  setMetaContent('meta[property="og:title"]', "property", "og:title", route.title);
  setMetaContent('meta[property="og:description"]', "property", "og:description", route.description);
  setMetaContent('meta[property="og:url"]', "property", "og:url", url);
  setMetaContent('meta[name="twitter:title"]', "name", "twitter:title", route.title);
  setMetaContent('meta[name="twitter:description"]', "name", "twitter:description", route.description);

  let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement("link");
    canonical.setAttribute("rel", "canonical");
    document.head.append(canonical);
  }
  canonical.setAttribute("href", url);
}

function usePathname(): string {
  return useSyncExternalStore(subscribePathname, readPathname, () => "/");
}

function normalizePath(path: string): string {
  if (path === "/") return path;
  return path.replace(/\/+$/g, "") || "/";
}

function NavLink(props: { to: string; children: string; className: string; activePath?: string }) {
  const active = props.activePath === props.to;

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.altKey ||
      event.ctrlKey ||
      event.shiftKey
    ) {
      return;
    }

    event.preventDefault();
    if (!active) navigate(props.to);
  }

  return (
    <a
      href={pathWithBase(props.to)}
      className={props.className}
      aria-current={active ? "page" : undefined}
      onClick={handleClick}
    >
      {props.children}
    </a>
  );
}

export function App() {
  const pathname = usePathname();
  const route = ROUTES.find((candidate) => candidate.path === pathname) ?? ROUTES[0]!;
  const Page = route.Component;
  const groupedRoutes = {
    Start: ROUTES.filter((item) => item.group === "Start"),
    Demos: ROUTES.filter((item) => item.group === "Demos"),
  };

  useEffect(() => {
    setRouteMetadata(route);
  }, [route]);

  return (
    <div className="flex min-h-screen flex-col bg-white text-stone-900 md:flex-row">
      <a
        href="#main-content"
        className="sr-only z-50 rounded bg-stone-950 px-3 py-2 text-sm font-medium text-white focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Skip to content
      </a>
      <nav
        aria-label="Site navigation"
        className="shrink-0 border-b border-stone-200 bg-white text-sm md:sticky md:top-0 md:h-screen md:w-52 md:self-start md:overflow-y-auto md:border-b-0 md:border-r"
      >
        <NavLink to="/" className="flex px-4 py-3 font-mono text-stone-950 no-underline hover:text-stone-600 md:border-b md:border-stone-200">
          zod-crud
        </NavLink>
        <div className="flex gap-4 overflow-x-auto px-3 pb-3 md:grid md:gap-4 md:px-2">
          {Object.entries(groupedRoutes).map(([group, routes]) => (
            <div key={group} className="flex shrink-0 gap-1 md:grid">
              <div className="hidden border-0 bg-transparent px-2 py-1 text-[10px] font-medium text-stone-400 md:flex">
                {group}
              </div>
              {routes.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  activePath={route.path}
                  className="flex border-b border-transparent px-2 py-1 text-stone-500 no-underline hover:text-stone-950 aria-[current=page]:border-stone-950 aria-[current=page]:font-medium aria-[current=page]:text-stone-950 md:border-b-0 md:border-l md:px-3"
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </div>
      </nav>
      <div id="main-content" className="min-w-0 flex-1">
        <Suspense fallback={<div aria-hidden="true" />}>
          <Page />
        </Suspense>
      </div>
    </div>
  );
}
