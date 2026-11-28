import { BlockClockIcon } from "@/components/icons/block-clock-icon";
import { LinkedValue } from "@/components/shared/linked-value";
import type { ChainId } from "@/lib/shared/chains";

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
// `chainId` links the number to the chain's explorer, a LinkedValue (anatomy
// L14) whose tooltip reads "Block 26,076,814", then "View on Etherscan ↗";
// without it the number is text.
//
// A stated block is a coordinate, the block a reading was taken at, so the
// stamp carries `data-prov-exempt` (receipts grammar, the coverage tripwire:
// a receipt's source coordinates hold the block; it is no figure to trace).

export function BlockRef({
  block,
  chainId,
  size = 14,
  className,
  numberClassName,
  linkClassName = "link-external",
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
}) {
  const formatted = typeof block === "number" ? block.toLocaleString("en-US") : block;
  const name = `Block ${formatted}`;
  const icon = <BlockClockIcon size={size} className="shrink-0 self-center" />;
  const number = <span className={`tabular-nums ${numberClassName ?? ""}`}>{formatted}</span>;
  const shell = `inline-flex items-baseline gap-1 whitespace-nowrap align-baseline ${className ?? ""}`;

  if (chainId != null) {
    return (
      <LinkedValue
        explorer={{ chainId, kind: "block", value: String(block).replace(/,/g, "") }}
        context={name}
        label={name}
        className={`${linkClassName} ${shell}`}
        dataAttrs={{ "data-block-ref": "", "data-prov-exempt": "" }}
      >
        {icon}
        {number}
      </LinkedValue>
    );
  }
  return (
    <span role="group" aria-label={name} title={name} className={shell} data-block-ref="" data-prov-exempt="">
      {icon}
      <span aria-hidden className="contents">
        {number}
      </span>
    </span>
  );
}
