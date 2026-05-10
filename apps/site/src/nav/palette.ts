/**
 * Palette SSOT — 각 route 의 `staticData.palette` 를 router 에서 수집한다.
 * SidebarNav · Landing 모두 이 함수를 거친다. (ds 패턴 동일)
 */
import type { useRouter } from "@tanstack/react-router";

export interface PaletteEntry {
  id: string;
  label: string;
  to: string;
  params?: Record<string, string>;
  category?: string;
  sub?: string;
  order?: number;
}

type RouterLike = ReturnType<typeof useRouter>;

export function collectPalette(router: RouterLike): PaletteEntry[] {
  const out: PaletteEntry[] = [];
  for (const [id, r] of Object.entries(router.routesById ?? {})) {
    const p = (r as { options?: { staticData?: { palette?: Omit<PaletteEntry, "id"> } } })
      .options?.staticData?.palette;
    if (p) out.push({ id, ...p });
  }
  return out.sort((a, b) => {
    const ao = a.order ?? 999;
    const bo = b.order ?? 999;
    if (ao !== bo) return ao - bo;
    return a.label.localeCompare(b.label);
  });
}

export const paletteCategory = (e: PaletteEntry): string => {
  if (e.category) return e.category;
  const segs = e.to.split("/").filter((s) => s && s !== "$");
  if (segs.length === 0) return "Home";
  return segs[0]!.charAt(0).toUpperCase() + segs[0]!.slice(1);
};
