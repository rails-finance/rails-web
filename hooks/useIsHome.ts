"use client";

import { usePathname } from "next/navigation";

/** Whether the route is the home page.
 *
 *  `/index` counts as home: when Vercel regenerates the ISR home page in the
 *  background it renders the route as `/index` (its RSC payload carries the
 *  segments `["", "index"]`), so `usePathname()` reads `/index` on the server
 *  and `/` in the browser. A home check on `=== "/"` alone then draws the
 *  server's markup for some other page and React throws error #418 at
 *  hydration (ui-jobs 464, seen on every load of production on 11 Nov 2026).
 *  No route lives at `/index`. */
export function useIsHome(): boolean {
  const pathname = usePathname();
  return pathname === "/" || pathname === "/index";
}
