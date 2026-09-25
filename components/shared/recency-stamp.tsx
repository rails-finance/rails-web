"use client";

// Recency stamp — decision 0006's freshness signal on the live/current surfaces.
// "▣ 2 min ago": how long ago the latest block of the ROUTE'S OWN CHAIN was
// minted, so staleness is legible and the user can judge whether a reload is
// worth it (the reload IS the refresh — no button). The age ticks client-side
// off the block timestamp; the head only re-pulls on focus / reload.
// Fail-soft: renders nothing when the chain head is unavailable.
//
// THE AGE IS WHAT THE STAMP IS FOR, AND THE BLOCK NUMBER IS BEHIND IT (ui-jobs
// 59). The row used to read "▣ 26,055,301 · < 1 min ago" and the nine-character
// number was the wider half and the less used one: 0006 gives this stamp one
// job, making staleness legible, and per-value provenance is stamped
// separately. So the stamp is a BUTTON that shows the age, and a press swaps it
// to the block number — both values stay reachable, and the width the number
// gave up is what lets the price trigger beside it show a figure on a phone
// (components/shared/latest-prices.tsx).
//
// THE SWAP IS NOT STICKY. It is a peek, not a preference: a stored "show the
// block" would put the wider half back on every page and undo the change, and
// the default has to be the value the stamp exists to state. The copy-for-LLM
// exports carry the block number from the page's own data either way
// (lib/<proto>/position-to-markdown.ts), so nothing depends on this row.

import { useEffect, useState } from "react";
import { Box } from "lucide-react";
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
  // Which half is on show. Page-local by design — see the note at the top.
  const [showBlock, setShowBlock] = useState(false);

  if (!head) return null;
  const age = formatCompactAge(Date.now() - head.blockTimestamp * 1000);
  const block = head.blockNumber.toLocaleString("en-US");

  return (
    <button
      type="button"
      onClick={() => setShowBlock((v) => !v)}
      aria-pressed={showBlock}
      // The visible text is a value, so the action goes in the name: a reader
      // who cannot see the swap still learns both what it says and what a
      // press does.
      aria-label={
        showBlock
          ? `Chain at block ${block}. Show how long ago it was minted instead.`
          : `Chain head minted ${age} ago. Show the block number instead.`
      }
      title={`Latest ${chain.name} block Rails is reading against — the page's live on-chain values track the head. Reload to advance it. Press to swap between the age and the block number.`}
      // The control grammar rather than a bare span: the age has to read as
      // pressable, or the block number is a value nobody finds by looking. Same
      // height and radius as the price trigger beside it, one type size down.
      className={className ?? `${CTRL_GHOST} ${CTRL_OFF} h-7 gap-1.5 rounded-md px-1.5 text-[11px] tabular-nums`}
    >
      <Box size={12} aria-hidden />
      <span aria-hidden>{showBlock ? block : `${age} ago`}</span>
    </button>
  );
}
