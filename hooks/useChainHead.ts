"use client";

import { useEffect, useState } from "react";
import { useChainId } from "@/lib/shared/chain-context";

export interface ChainHead {
  blockNumber: number;
  blockTimestamp: number;
  /** "index": the newest block the index holds (Ethereum, Base); "rpc": the
   *  chain's latest (Arbitrum, Sepolia, or the api not answering). */
  source?: "index" | "rpc";
}

// Fetches the page's head (block + timestamp; on Ethereum and Base the newest
// block the index holds, see app/api/head/route.ts) from /api/head once on
// mount and again when the tab regains focus. The chain comes from context, so
// a Base route group stamps a Base block — a page that read Base state must not
// date itself by an Ethereum block, which is the same figure rendered against
// a chain it says nothing about. The recency stamp derives "~X ago"
// from blockTimestamp client-side, so the displayed age advances without any
// further RPC — only a focus (or reload) pulls a fresh head. Fail-soft: `head` stays
// null when the head is unavailable, so callers render nothing.
/** The head and whether its read has ended without one, so a caller can hold
 *  the stamp's place while the read is out and let it go once it has failed. */
export function useChainHeadRead(): { head: ChainHead | null; failed: boolean } {
  const chainId = useChainId();
  const [head, setHead] = useState<ChainHead | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch(`/api/head?chain=${chainId}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (cancelled) return;
          if (d && typeof d.blockNumber === "number") setHead(d as ChainHead);
          else setFailed(true);
        })
        .catch(() => {
          if (!cancelled) setFailed(true);
        });
    load();
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, [chainId]);

  return { head, failed: failed && head == null };
}
