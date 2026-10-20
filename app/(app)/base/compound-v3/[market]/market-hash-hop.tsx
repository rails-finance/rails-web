"use client";

// A wallet URL from before Base's Compound pages went per market carried its
// Comet as an anchor, `/base/compound-v3/<wallet>#market-<key>`. The anchor
// never reaches the server, so the holder view sends it on here, once, to
// that market page (the anchor kept, where the market page scrolls to it).

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { compoundBaseMarketOf } from "@/lib/compound-base/asset-catalog";
import { compoundBaseMarketHref } from "@/lib/compound-base/routes";

export function MarketHashHop({ wallet }: { wallet: string }) {
  const router = useRouter();
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!hash.startsWith("market-")) return;
    const market = compoundBaseMarketOf(hash.slice("market-".length));
    if (market) router.replace(`${compoundBaseMarketHref(market.key, wallet)}#${hash}`);
  }, [router, wallet]);
  return null;
}
