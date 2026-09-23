"use client";

import { useState } from "react";
import { Check, Link as LinkIcon } from "lucide-react";
import { ExplorerMark } from "@/components/shared/explorer-mark";
import { TxHashBadge } from "@/components/shared/tx-hash-badge";
import { useChainId } from "@/lib/shared/chain-context";
import { chainMeta, explorerUrl } from "@/lib/shared/chains";
import { CTRL_GHOST, CTRL_OFF } from "@/lib/shared/ui-grammar";

export interface EventCardFooterProps {
  txHash: string;
  extra?: React.ReactNode;
  /** The Learn-More "?" trigger — rightmost on this row, beside the tx links
   *  (per Miles 2026-07-24: on the SAME row as tx hash + Etherscan, not
   *  floating at the pane's corner). */
  learnMore?: React.ReactNode;
  /** Href for "copy a link to this event," from `useEventShareHref()` at the
   *  card shell. Renders `CopyEventLink` in the left cluster, right after the
   *  Etherscan mark. Absent (and no control drawn) for a card rendered
   *  outside a timeline, where there is nothing to link to. */
  shareHref?: string;
}

/* ── The share control ───────────────────────────────────────────────── */

/** Copy a link to THIS event. It lives here, in the footer's left cluster —
 *  after the tx hash and the Etherscan mark, before Learn More — because this
 *  is the Explanation pane's own metadata row, and a reader reaches for a
 *  share link once they have already opened the card to look closer, the
 *  same reader already reading the tx hash and the explorer mark it now sits
 *  beside. That costs one extra tap over a header placement (open the card
 *  first), which is the right price for a control used less often than the
 *  always-visible ones on a closed card.
 *
 *  It sat in the card shell's header row instead, beside the expand chevron,
 *  from 2026-09-10 until 2026-09-11, when Miles moved it back here.
 *
 *  Token set: `CTRL_GHOST + CTRL_OFF` — muted at rest, soft fill and
 *  foreground on hover. Always rendered, never hover-only: the app has no
 *  hover-only chrome control, and touch has no hover at all.
 *
 *  The href comes from `EventShareProvider` via the card shell's
 *  `useEventShareHref()` (`event-card.tsx`) — `ChainTruthTimeline` wraps
 *  every rendered card in one, so a card drawn outside a timeline (a
 *  simulator shell, a standalone preview) gets no href and no control,
 *  rather than a broken one. Same glyph-swap confirmation as every other
 *  copy in the app: a tick for a moment, then the link glyph again. */
function CopyEventLink({ href }: { href: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${href}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error("Failed to copy the event link:", err);
    }
  };
  return (
    <button
      type="button"
      // No `focus:outline-none` — the browser's own focus-visible ring stands.
      className={`${CTRL_GHOST} ${CTRL_OFF} h-7 w-7 rounded-md`}
      aria-label={copied ? "Link copied" : "Copy a link to this event"}
      title={copied ? "Link copied" : "Copy a link to this event"}
      onClick={(e) => {
        e.stopPropagation();
        void copy();
      }}
      // This row is not a click-to-toggle target (only the header above it
      // is), so this guard is likely unnecessary here — left in place since
      // it is harmless and the control's behavior is otherwise unchanged.
      onKeyDown={(e) => e.stopPropagation()}
    >
      {copied ? <Check size={12} /> : <LinkIcon size={12} />}
    </button>
  );
}

export function EventCardFooter({ txHash, extra, learnMore, shareHref }: EventCardFooterProps) {
  // Layout per Miles (2026-07-23/24): the transaction links sit on the LEFT —
  // tx hash first, then the explorer link, then (2026-09-11) the copy-event-
  // link control. The right cluster holds `extra` (gas, run counts) and,
  // rightmost, the Learn-More "?" trigger.
  const chainId = useChainId();
  const explorer = chainMeta(chainId).explorerName;
  return (
    <div className="pt-1 px-4 pb-2 flex flex-wrap justify-between items-center gap-2">
      <div className="flex items-center gap-2">
        <TxHashBadge txHash={txHash} />
        <a
          href={explorerUrl(chainId, "tx-logs", txHash)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="link-muted"
          aria-label={`View on ${explorer}`}
        >
          <ExplorerMark chainId={chainId} />
        </a>
        {shareHref ? <CopyEventLink href={shareHref} /> : null}
      </div>
      <div className="flex items-center gap-3">
        {extra}
        {learnMore}
      </div>
    </div>
  );
}
