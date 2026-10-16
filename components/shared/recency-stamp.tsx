"use client";

// Recency stamp — decision 0006's freshness signal on the live/current surfaces.
// "▣ 2 min ago": how long ago the latest block of the ROUTE'S OWN CHAIN was
// minted, so staleness is legible and the user can judge whether a reload is
// worth it (the reload IS the refresh — no button). The age ticks client-side
// off the block timestamp; the head only re-pulls on focus / reload.
// Fail-soft: renders nothing when the chain head is unavailable.
//
// The stamp reads "3 min ago" on every explorer: the age in place, the
// block number in its peek (a RevealTip, opened by a press; rails-ops
// detail-page-anatomy, "Shared row rules"). The copy-for-LLM exports carry the
// block number from the page's own data (lib/<proto>/position-to-markdown.ts).

import { useEffect, useState } from "react";
import { Box } from "lucide-react";
import { RevealTip } from "@/components/shared/reveal-tip";
import { useChainHead } from "@/hooks/useChainHead";
import { useChainId } from "@/lib/shared/chain-context";
import { chainMeta } from "@/lib/shared/chains";
import { CTRL_GHOST, CTRL_OFF } from "@/lib/shared/ui-grammar";

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

/** `compact` drops the cube below sm, for the detail pages' top row, which
 *  carries back, this stamp, the labelled prices trigger and Tools across
 *  390px. */
export function RecencyStamp({ className, compact = false }: { className?: string; compact?: boolean }) {
  const head = useChainHead();
  const chain = chainMeta(useChainId());
  // Re-render every 30s so the age stays current without re-fetching.
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  if (!head) return null;
  const age = formatCompactAge(Date.now() - head.blockTimestamp * 1000);
  const block = head.blockNumber.toLocaleString("en-US");

  return (
    <RevealTip
      align="end"
      wrap
      tip={`Block ${block}, the latest ${chain.name} block this page reads. Reload to advance it.`}
    >
      <button
        type="button"
        data-anatomy="H6"
        aria-label={`Chain head minted ${age} ago, block ${block}.`}
        // The control grammar: the stamp reads as pressable, so its peek is
        // found. Same height and radius as the price trigger beside it, one
        // type size down.
        className={className ?? `${CTRL_GHOST} ${CTRL_OFF} h-7 gap-1.5 rounded-md px-1.5 text-[11px] tabular-nums`}
      >
        <Box size={12} aria-hidden className={compact ? "hidden sm:block" : undefined} />
        <span aria-hidden>{age} ago</span>
      </button>
    </RevealTip>
  );
}
