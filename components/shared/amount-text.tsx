// AmountText — an amount as the shared formatters write it, with the exact
// decimal in a tooltip (hover, or tap on touch) wherever the figure is a floor
// ("<0.000001", or "<0.01" on a headline). A figure that states its digits
// renders as bare text, so the DOM around it is unchanged.
//
// The floor rule lives in lib/utils/format.ts (formatTinyNonZero,
// formatHeadlineAmount). Receipts and the provenance inspector keep the raw
// exact value; this only changes the face.

import type { ReactNode } from "react";
import { RevealTip } from "./reveal-tip";
import {
  formatCompact,
  formatExact,
  formatHeadlineAmount,
  formatNumber,
  formatTinyNonZero,
  isFloorText,
} from "@/lib/utils/format";

type AmountFormat = "number" | "compact" | "headline" | "tiny";

function formatAs(value: number, format: AmountFormat, symbol?: string): string {
  switch (format) {
    case "compact":
      return formatCompact(value);
    case "headline":
      return formatHeadlineAmount(value, symbol);
    case "tiny":
      return formatTinyNonZero(value);
    default:
      return formatNumber(value);
  }
}

/** A preformatted figure plus its exact decimal: the tooltip opens where the
 *  figure is a floor, or on every figure with `always`. `symbol` joins the
 *  tooltip and the accessible name ("0.0000000207 UNI"). */
export function ExactTip({
  text,
  exact,
  symbol,
  always = false,
  className,
}: {
  text: ReactNode;
  exact: string;
  symbol?: string;
  always?: boolean;
  className?: string;
}) {
  if (!always && !(typeof text === "string" && isFloorText(text))) return <>{text}</>;
  const full = symbol ? `${exact} ${symbol}` : exact;
  return (
    <RevealTip tip={full} label={full} className={className}>
      {text}
    </RevealTip>
  );
}

export function AmountText({
  value,
  format = "number",
  symbol,
  exact,
}: {
  value: number;
  format?: AmountFormat;
  /** Joins the tooltip; also picks the headline floor (formatHeadlineAmount). */
  symbol?: string;
  /** The exact decimal where the caller has one (formatUnitsExact of the raw
   *  amount); formatExact(value) otherwise. */
  exact?: string;
}) {
  const text = formatAs(value, format, symbol);
  if (!isFloorText(text)) return <>{text}</>;
  return <ExactTip text={text} exact={exact ?? formatExact(value)} symbol={symbol} />;
}

/** A card's per-asset line ("0.000001 XAUt", "<0.000001 UNI"): the exact
 *  decimal in the tooltip on every line, and on the provenance capture
 *  (data-prov-exact / data-prov-symbol). */
export function ExactSpan({ exact, symbol, children }: { exact: string; symbol: string; children: ReactNode }) {
  const full = `${exact} ${symbol}`;
  return (
    <RevealTip tip={full} label={full}>
      <span data-prov-exact={exact} data-prov-symbol={symbol}>
        {children}
      </span>
    </RevealTip>
  );
}
