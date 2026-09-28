import type { MouseEventHandler } from "react";
import { BlockClockIcon } from "@/components/icons/block-clock-icon";
import { explorerUrl, type ChainId } from "@/lib/shared/chains";

// A stated block number: [block-clock icon] 26,076,814. The icon stands in
// for the word "block" on a line whose job is to name a block (a chain
// snapshot, a receipt's source, a card's "at block"); the word stays in the
// hover text and the accessible name, "Block 26,076,814". Prose keeps the
// word ("read at the block shown"): this is for the stamp, never a sentence.
// Standard: rails-ops/standards/detail-page-anatomy.md, "How a block number
// is stated".
//
// 14px is the floor. At 12px on a 1x screen the clock hands merge into the
// circle, so an 11px line still takes the 14px icon.
//
// `chainId` links the number to the chain's explorer, as the plain-text lines
// did; without it the number is text.

export function BlockRef({
  block,
  chainId,
  size = 14,
  className,
  numberClassName,
  linkClassName = "link-external",
  onClick,
}: {
  block: number | string;
  chainId?: ChainId;
  size?: number;
  className?: string;
  /** Classes for the number (a link colour, a foreground tone). */
  numberClassName?: string;
  /** The link's colour class where a line uses a quieter link than the
   *  default external one. */
  linkClassName?: string;
  /** For a link inside a pressable card: stop the press reaching the card. */
  onClick?: MouseEventHandler<HTMLAnchorElement>;
}) {
  const formatted = typeof block === "number" ? block.toLocaleString("en-US") : block;
  const name = `Block ${formatted}`;
  const icon = <BlockClockIcon size={size} className="shrink-0 self-center" />;
  const number = <span className={`tabular-nums ${numberClassName ?? ""}`}>{formatted}</span>;
  const shell = `inline-flex items-baseline gap-1 whitespace-nowrap align-baseline ${className ?? ""}`;

  if (chainId != null) {
    return (
      <a
        href={explorerUrl(chainId, "block", String(block).replace(/,/g, ""))}
        target="_blank"
        rel="noopener noreferrer"
        className={`${linkClassName} ${shell}`}
        title={name}
        aria-label={name}
        data-block-ref=""
        onClick={onClick}
      >
        {icon}
        {number}
      </a>
    );
  }
  return (
    <span role="group" aria-label={name} title={name} className={shell} data-block-ref="">
      {icon}
      <span aria-hidden className="contents">
        {number}
      </span>
    </span>
  );
}
