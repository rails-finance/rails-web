"use client";

// Recency stamp — decision 0006's freshness signal on the live/current surfaces.
// "▣ N · 2 min ago": the latest block of the ROUTE'S OWN CHAIN and how long
// ago it was minted, so staleness is legible and the user can judge whether a
// reload is worth it (the reload IS the refresh — no button). The age ticks
// client-side off the block timestamp; the head only re-pulls on focus /
// reload. Fail-soft: renders nothing when the chain head is unavailable.

import { useEffect, useState } from "react";
import { Box } from "lucide-react";
import { useChainHead } from "@/hooks/useChainHead";
import { useChainId } from "@/lib/shared/chain-context";
import { chainMeta } from "@/lib/shared/chains";

// Compact age for the 11px stamp: "< 1 min" / "5 min" / "3 hr" / "2 d".
// Deliberately NOT lib/date's formatDuration — that is shared by 35 call sites
// (event cards, timelines) at a fuller register ("less than a minute", "N hrs");
// rewording it to suit this stamp would silently rewrite all of them.
function formatCompactAge(elapsedMs: number): string {
  const s = Math.floor(elapsedMs / 1000);
  if (s < 60) return "< 1 min";
  const min = Math.floor(s / 60);
  if (min < 60) return `${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr`;
  return `${Math.floor(hr / 24)} d`;
}

export function RecencyStamp({ className }: { className?: string }) {
  const head = useChainHead();
  // The head itself was already per-chain (useChainHead reads the route's
  // chain); only this label was not, so a Base page showed a Base block number
  // under the words "latest Ethereum block".
  const chain = chainMeta(useChainId());
  // Re-render every 30s so the "~X ago" age stays current without re-fetching.
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  if (!head) return null;
  const age = formatCompactAge(Date.now() - head.blockTimestamp * 1000);

  return (
    <span
      className={className ?? "inline-flex items-center gap-1.5 text-[11px] text-rb-500 tabular-nums"}
      title={`Latest ${chain.name} block Rails is reading against — the page's live on-chain values track the head. Reload to advance it.`}
    >
      <Box size={12} aria-hidden />
      <span>
        <span className="sr-only">Chain at block </span>
        {head.blockNumber.toLocaleString("en-US")} · {age} ago
      </span>
    </span>
  );
}
