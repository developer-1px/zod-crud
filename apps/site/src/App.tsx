import { type ComponentType, type MouseEvent, useEffect, useSyncExternalStore } from "react";
import { ApiCollection } from "@zod-crud/api-collection";
import { App as MobileCms } from "@zod-crud/mobile-cms";
import { Outliner } from "@zod-crud/outliner";
import { Docs } from "./routes/Docs";
import { Home } from "./routes/Home";
import { Playground } from "./routes/Playground";

type Route = {
  path: string;
  label: string;
  title: string;
  Component: ComponentType;
  group: "Start" | "Demos";
};

const BASE_PATH = import.meta.env.BASE_URL.replace(/\/$/, "");
const SITE_URL = (import.meta.env.VITE_SITE_URL ?? "https://developer-1px.github.io/zod-crud").replace(/\/$/, "");
const ROUTES: Route[] = [
  { path: "/", label: "Overview", title: "zod-crud - Headless JSON editing", Component: Home, group: "Start" },
  { path: "/docs", label: "API reference", title: "zod-crud API - zod-crud", Component: Docs, group: "Start" },
  { path: "/playground", label: "Workbench", title: "Workbench - zod-crud", Component: Playground, group: "Demos" },
  { path: "/playground/outliner", label: "Outliner", title: "Outliner demo - zod-crud", Component: Outliner, group: "Demos" },
  { path: "/playground/mobile-cms", label: "Mobile CMS", title: "Mobile CMS demo - zod-crud", Component: MobileCms, group: "Demos" },
  { path: "/playground/api-collection", label: "API collection", title: "API collection demo - zod-crud", Component: ApiCollection, group: "Demos" },
];

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
  setMetaContent('meta[property="og:title"]', "property", "og:title", route.title);
  setMetaContent('meta[property="og:url"]', "property", "og:url", url);

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
    <div className="flex min-h-screen flex-col bg-stone-50 text-stone-900 md:flex-row md:overflow-hidden">
      <a
        href="#main-content"
        className="sr-only z-50 rounded bg-stone-950 px-3 py-2 text-sm font-medium text-white focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Skip to content
      </a>
      <nav
        aria-label="Site navigation"
        className="shrink-0 border-b border-stone-200 bg-white text-sm md:h-screen md:w-56 md:overflow-y-auto md:border-b-0 md:border-r"
      >
        <NavLink to="/" className="block px-4 py-3 font-mono text-stone-950 no-underline hover:bg-stone-100">
          zod-crud
        </NavLink>
        <div className="grid gap-3 px-2 pb-3">
          {Object.entries(groupedRoutes).map(([group, routes]) => (
            <div key={group}>
              <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-stone-400">
                {group}
              </div>
              {routes.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  activePath={route.path}
                  className="block rounded px-2 py-1 text-stone-700 no-underline hover:bg-stone-100 hover:text-stone-900 aria-[current=page]:bg-stone-950 aria-[current=page]:text-stone-50"
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </div>
      </nav>
      <div id="main-content" className="flex-1 md:overflow-auto">
        <Page />
      </div>
    </div>
  );
}
