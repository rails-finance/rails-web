import type { ReactNode } from "react";
import { RevealTip } from "@/components/shared/reveal-tip";
import { PROTOCOLS } from "@/lib/shared/protocols";
import { READ_TIER } from "@/lib/shared/read-tier";

/** The "Read on visit" tier's tag (H23; rails-ops decision 0061): one neutral
 *  outlined pill, kept off the green of the home example's "Live position"
 *  pill. `tip` is where the tier's line goes: "bubble" opens it on a tap
 *  (`RevealTip`), "title" leaves a hover title (a home tile, which is a link
 *  and would clip a bubble), and `false` adds nothing, for a tag drawn beside
 *  the line. The 12px line height keeps a tile's row height. */
export function ReadTierTag({ tip = "bubble" }: { tip?: "bubble" | "title" | false }) {
  const pill = (
    <span
      className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full border border-rb-300 px-1.5 py-px text-[9px] font-semibold uppercase leading-[12px] tracking-wider text-rb-500 dark:border-rb-700 dark:text-rb-400"
      data-anatomy={tip === "bubble" ? undefined : "H23"}
      data-read-tier="visit"
      title={tip === "title" ? READ_TIER.line : undefined}
    >
      {READ_TIER.name}
    </span>
  );
  if (tip !== "bubble") return pill;
  return (
    <span className="inline-flex shrink-0" data-anatomy="H23">
      <RevealTip tip={READ_TIER.line} label={`${READ_TIER.name}: ${READ_TIER.line}`} wrap focusable>
        {pill}
      </RevealTip>
    </span>
  );
}

/** Whether a roster entry is in the tier, by its roster id. */
export const isReadOnVisit = (id: string): boolean => PROTOCOLS.some((p) => p.id === id && p.readTier === "visit");

/** A page head's title with the tag after it, for an explorer in the tier;
 *  the title alone otherwise. The same place on every position and wallet
 *  head. */
export function ReadTierTitleRow({ id, children }: { id: string; children: ReactNode }) {
  if (!isReadOnVisit(id)) return <>{children}</>;
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
      {children}
      <ReadTierTag />
    </div>
  );
}
