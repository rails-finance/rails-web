// The holder donut (E4; rails-ops ui-jobs 553, door 3): a vault's largest live
// holders from the census, each its own hue, the rest one grey slice, the live
// holder count in the middle, drawn by the position card's ShareDonut (its
// rounded, padded slices; ui-jobs 602). The hues are the colour grammar's one exception
// (standards/color-grammar.md, "The holder donut"): fixed by rank, the same in
// both themes, never green or red, and meaning nothing. Each slice's title
// names the holder, its shape where the census stores one, and its share.
// Slices and maths: lib/vaults/compare.ts; words: lib/vaults/compare-words.ts.

import { ShareDonut } from "@/components/shared/asset-donut";
import { donutSlices } from "@/lib/vaults/compare";
import { HOLDER_WORDS } from "@/lib/vaults/compare-words";
import { flooredPct, shortHex } from "@/lib/vaults/health-words";
import { formatCompact } from "@/lib/shared/format-compact";
import type { CompareHolder } from "@/lib/vaults/compare-read";

/** By rank; mid-tone so each reads on the light and the dark ground. */
export const HOLDER_HUES = ["#5b7cfa", "#ee8a3c", "#9b6bdf", "#d4a92a", "#3aa9c6", "#d266a6"] as const;
const OTHERS = "var(--donut-other)";

/** The breakdown donut's reference size: its rounded, padded slices (ShareDonut). */
const SIZE = 120;

/** The count in the middle: in full below 1,000, compact from it. */
export const holderCount = (n: number): string => (n < 1000 ? n.toLocaleString("en-US") : formatCompact(n));

export function HolderDonut({ top, live }: { top: CompareHolder[]; live: number }) {
  const slices = donutSlices(top);
  const shapeOf = new Map(top.map((h) => [h.holder, h.shape]));
  const colourOf = (i: number, holder: string | null) =>
    holder == null ? OTHERS : HOLDER_HUES[i % HOLDER_HUES.length];
  const title = (holder: string | null, share: number) =>
    holder == null
      ? HOLDER_WORDS.othersTitle(flooredPct(share))
      : HOLDER_WORDS.slice(holder, shapeOf.get(holder) ?? null, flooredPct(share));
  const count = holderCount(live);
  return (
    <div className="flex flex-wrap items-center gap-4" data-anatomy="E4" data-compare-donut={live}>
      <ShareDonut
        slices={slices.map((s) => ({
          key: s.holder ?? "others",
          label: title(s.holder, s.share),
          share: s.share,
          rest: s.holder == null,
        }))}
        colours={slices.map((s, i) => colourOf(i, s.holder))}
        size={SIZE}
        label={HOLDER_WORDS.aria(count)}
        centre={
          <>
            <span className="text-[17px] font-semibold leading-tight tabular-nums text-foreground">{count}</span>
            <span className="text-[11px] text-rb-500">{HOLDER_WORDS.centre}</span>
          </>
        }
      />
      <ul className="min-w-0 space-y-1 text-xs">
        {slices.map((s, i) => (
          <li
            key={s.holder ?? "others"}
            className="flex items-center gap-1.5 tabular-nums"
            title={title(s.holder, s.share)}
          >
            <span
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ background: colourOf(i, s.holder) }}
            />
            <span className={s.holder ? "font-mono text-foreground" : "text-rb-500"}>
              {s.holder ? shortHex(s.holder) : HOLDER_WORDS.others}
            </span>
            <span className="text-rb-500">{flooredPct(s.share)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
