"use client";

import { useEffect, useState } from "react";
import { useChainId } from "@/lib/shared/chain-context";

export interface ChainHead {
  blockNumber: number;
  blockTimestamp: number;
}

// Fetches the current chain head (block + timestamp) from /api/head once on
// mount and again when the tab regains focus. The chain comes from context, so
// a Base route group stamps a Base block — a page that read Base state must not
// date itself by an Ethereum block, which is the same figure rendered against
// a chain it says nothing about. The recency stamp derives "~X ago"
// from blockTimestamp client-side, so the displayed age advances without any
// further RPC — only a focus (or reload) pulls a fresh head. Fail-soft: stays
// null when the head is unavailable, so callers render nothing.
export function useChainHead(): ChainHead | null {
  const chainId = useChainId();
  const [head, setHead] = useState<ChainHead | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch(`/api/head?chain=${chainId}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!cancelled && d && typeof d.blockNumber === "number") setHead(d as ChainHead);
        })
        .catch(() => {});
    load();
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, [chainId]);

  return head;
}
