"use client";

// <OldPriceLabel> — the Lifetime flows readout's price label (rails-ops
// reference/lifetime-flows-scrubber.md, "Prices"): a clock and "Old price" on a
// day where a held asset is valued at an old price, "Repriced" on a day that
// gave one a newer price, in neutral grey (an old price is a gap in the data;
// orange is for a change to the owner's position, decisions/0034). Its slot
// keeps one size whether the label shows or not, so the panel never changes
// height while scrubbing. The tip (RevealTip: hover, keyboard focus, tap)
// names each asset and the day of its price (`oldPriceAt`).

import { Clock } from "lucide-react";
import { RevealTip } from "@/components/shared/reveal-tip";
import type { oldPriceAt } from "@/lib/shared/flows-timeline";

const WORDS = ["Old price", "Repriced"] as const;

const PILL =
  "col-start-1 row-start-1 inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-rb-300 px-1.5 py-0.5 text-[11px] font-medium leading-none text-rb-500 dark:border-rb-600";

/** The tip's sentences, wrapped to a readable width inside the viewport. */
export function OldPriceTip({ lines }: { lines: string[] }) {
  return (
    <span className="block w-64 max-w-[calc(100vw-48px)] whitespace-normal font-normal leading-snug">
      {lines.map((l) => (
        <span key={l} className="block">
          {l}
        </span>
      ))}
    </span>
  );
}

export function OldPriceLabel({ note }: { note: ReturnType<typeof oldPriceAt> }) {
  return (
    <span className="inline-grid shrink-0" data-flow-old-price={note?.word ?? ""} data-anatomy="F2.2">
      {/* Both words, unseen, hold the slot at the wider one. */}
      {WORDS.map((w) => (
        <span key={w} aria-hidden className={`${PILL} invisible`}>
          <Clock size={11} aria-hidden />
          {w}
        </span>
      ))}
      {note && (
        <RevealTip
          className="focus-ring col-start-1 row-start-1 justify-self-end rounded-full"
          focusable
          align="end"
          label={`${note.word}: ${note.lines.join(" ")}`}
          tip={<OldPriceTip lines={note.lines} />}
        >
          <span className={`${PILL} cursor-help`}>
            <Clock size={11} aria-hidden />
            {note.word}
          </span>
        </RevealTip>
      )}
    </span>
  );
}
