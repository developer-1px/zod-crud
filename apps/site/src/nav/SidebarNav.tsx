/**
 * 좌측 네비. SSOT = 각 route 의 staticData.palette.
 * 새 route 추가 = 그 파일 안에 staticData.palette 만 채우면 자동 등장. (ds 와 동일 패턴)
 */
import { useRef } from "react";
import { useRouter, Link } from "@tanstack/react-router";
import { collectPalette, paletteCategory } from "./palette";

export function SidebarNav() {
  const router = useRouter();
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const closeOnMobile = () => {
    if (window.matchMedia("(max-width: 767px)").matches) {
      detailsRef.current?.removeAttribute("open");
    }
  };

  const entries = collectPalette(router);
  const groups = new Map<string, typeof entries>();
  for (const e of entries) {
    const k = paletteCategory(e);
    const arr = groups.get(k) ?? [];
    arr.push(e);
    groups.set(k, arr);
  }

  const pathname = router.state.location.pathname;

  return (
    <div
      aria-label="Site navigation"
      className="shrink-0 border-stone-200 bg-stone-50 text-sm border-b md:border-b-0 md:border-r md:h-screen md:w-56 md:overflow-y-auto"
    >
      <details ref={detailsRef} className="group flex flex-col gap-4 p-3 md:!block" open>
        <summary className="cursor-pointer list-none px-2 py-1 font-semibold text-stone-900 marker:hidden hover:bg-stone-200 md:hidden">
          ☰ zod-crud
        </summary>
        <Link
          to="/"
          onClick={closeOnMobile}
          className="hidden px-2 py-1 font-semibold text-stone-900 hover:bg-stone-200 md:block"
        >
          zod-crud
        </Link>
        <nav aria-label="Site navigation" className="mt-3 flex flex-col gap-4">
          {[...groups.entries()].map(([cat, list]) => (
            <div key={cat} className="flex flex-col gap-0.5">
              <div className="px-2 pt-1 pb-0.5 text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                {cat}
              </div>
              <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
                {list.map((e) => {
                  const href = e.params
                    ? Object.entries(e.params).reduce(
                      (p, [k, v]) => p.replace(`$${k}`, encodeURIComponent(v)),
                      e.to,
                    )
                    : e.to;
                  const current = pathname === href;
                  return (
                    <li key={e.id}>
                      <Link
                        to={e.to as never}
                        params={e.params as never}
                        onClick={closeOnMobile}
                        aria-current={current ? "page" : undefined}
                        className="block px-2 py-1 text-stone-700 no-underline hover:bg-stone-200 hover:text-stone-900 aria-[current=page]:bg-stone-900 aria-[current=page]:text-stone-50"
                      >
                        {e.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </details>
    </div>
  );
}
