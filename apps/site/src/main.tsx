import { StrictMode, type ComponentType, type MouseEvent, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { ApiCollectionPage } from "./routes/ApiCollection";
import { MobileCmsPage } from "./routes/MobileCms";
import { OutlinerPage } from "./routes/Outliner";
import { Playground } from "./routes/Playground";

type Route = { path: string; label: string; Component: ComponentType };

const BASE_PATH = import.meta.env.BASE_URL.replace(/\/$/, "");
const ROUTES: Route[] = [
  { path: "/playground", label: "Core", Component: Playground },
  { path: "/playground/outliner", label: "Outliner", Component: OutlinerPage },
  { path: "/playground/mobile-cms", label: "Mobile CMS", Component: MobileCmsPage },
  { path: "/playground/api-collection", label: "API collection", Component: ApiCollectionPage },
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
  return stripBase(window.location.pathname) || "/";
}

function subscribePathname(listener: () => void): () => void {
  window.addEventListener("popstate", listener);
  return () => window.removeEventListener("popstate", listener);
}

function navigate(path: string): void {
  window.history.pushState(null, "", pathWithBase(path));
  window.dispatchEvent(new Event("popstate"));
}

function usePathname(): string {
  return useSyncExternalStore(subscribePathname, readPathname, () => "/");
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

function App() {
  const pathname = usePathname();
  const activePath = pathname === "/" ? "/playground" : pathname;
  const route = ROUTES.find((candidate) => candidate.path === activePath);
  const Page = route?.Component ?? Playground;

  return (
    <div className="flex w-screen flex-col md:h-screen md:flex-row md:overflow-hidden">
      <nav
        aria-label="Site navigation"
        className="shrink-0 border-stone-200 text-sm border-b md:border-b-0 md:border-r md:h-screen md:w-52 md:overflow-y-auto"
      >
        <NavLink to="/" className="block px-4 py-3 font-mono text-stone-900 hover:bg-stone-100">
          zod-crud
        </NavLink>
        <div className="px-2 pb-3">
          <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-stone-400">
            Playground
          </div>
          {ROUTES.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              activePath={activePath}
              className="block px-2 py-1 text-stone-700 no-underline hover:bg-stone-100 hover:text-stone-900 aria-[current=page]:bg-stone-900 aria-[current=page]:text-stone-50"
            >
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>
      <div className="flex-1 md:overflow-auto">
        <Page />
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
