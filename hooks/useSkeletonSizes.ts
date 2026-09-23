"use client";

// The skeleton components' one read path for block heights: the measured
// defaults, with whatever the memory layer remembered for THIS route shape ×
// viewport bucket merged on top. `remembered` is exposed separately for the
// sections that only render when the route is known to have them (a listing's
// header-extra band) — a default would conjure a section most pages lack.
//
// Deliberately NOT a lazy state initializer: the first render must be the
// defaults on both server and client or a hard load would hydration-mismatch.
// The layout effect lands before paint on a client-side navigation (the case
// that matters — that's when loading.tsx actually shows), so the remembered
// sizes appear with no flash; on a hard load the SSR'd HTML paints defaults
// for one frame first, which is acceptable.

import { useLayoutEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  DEFAULT_SKELETON_SIZES,
  routeShapeKey,
  viewportBucket,
  type SkeletonSection,
} from "@/lib/shared/skeleton-sizes";
import { readSkeletonSizes } from "@/lib/shared/skeleton-size-store";

export interface SkeletonSizesResult {
  /** Defaults overlaid with this route × bucket's remembered sizes. */
  sizes: Record<SkeletonSection, number>;
  /** Only what the memory layer actually recorded for this route × bucket. */
  remembered: Partial<Record<SkeletonSection, number>>;
}

const DEFAULTS_ONLY: SkeletonSizesResult = { sizes: DEFAULT_SKELETON_SIZES, remembered: {} };

export function useSkeletonSizes(): SkeletonSizesResult {
  const pathname = usePathname();
  const [result, setResult] = useState<SkeletonSizesResult>(DEFAULTS_ONLY);

  useLayoutEffect(() => {
    if (!pathname) return;
    const remembered = readSkeletonSizes(routeShapeKey(pathname), viewportBucket(window.innerWidth));
    setResult(
      Object.keys(remembered).length === 0
        ? DEFAULTS_ONLY
        : { sizes: { ...DEFAULT_SKELETON_SIZES, ...remembered }, remembered },
    );
  }, [pathname]);

  return result;
}
