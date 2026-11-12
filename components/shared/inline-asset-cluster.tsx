"use client";

import { useContext } from "react";
import { QuietTipsContext } from "@/components/shared/reveal-tip";
import type { AssetMark } from "@/lib/shared/asset-mark";
import { TokenChipIcon } from "./token-chip-icon";

// Compact inline icon cluster for "value + icons" rows on position cards.
// All symbols render at a small fixed size with light overlap; the parent row
// uses flex-wrap so the cluster pushes to a new line if it crowds the value.
// Past `max` symbols the stack caps and a trailing "+N" chip carries the rest —
// at seven uncapped icons the glyphs occlude into an unreadable band, so the
// cap keeps the cluster scannable on every card that renders it.
// Each asset comes with its address (AssetMark), so a cluster icon resolves
// through the same chain as the timeline's and the breakdown's.

export interface InlineAssetClusterProps {
  assets: AssetMark[];
  size?: number;
  overlap?: number;
  /** Cap on rendered icons; the remainder collapses into a "+N" chip whose
   *  title names the hidden symbols (identity only — never amounts). */
  max?: number;
}

export function InlineAssetCluster({ assets, size = 28, overlap = 9, max = 3 }: InlineAssetClusterProps) {
  // Inside the breakdown button the title falls quiet with the figure's tips.
  const quiet = useContext(QuietTipsContext);
  if (assets.length === 0) return null;
  const overflows = assets.length > max;
  const visible = overflows ? assets.slice(0, max) : assets;
  const hidden = overflows ? assets.slice(max) : [];
  return (
    <span className="inline-flex items-center">
      {visible.map((a, i) => (
        <span
          key={`${a.symbol}-${i}`}
          className="relative inline-flex items-center justify-center rounded-full bg-raised p-0.5"
          style={{ marginLeft: i > 0 ? -overlap : 0, zIndex: visible.length - i }}
        >
          <TokenChipIcon symbol={a.symbol} address={a.address ?? undefined} size={size} filterable={false} />
        </span>
      ))}
      {hidden.length > 0 && (
        // Overflow chip — cluster chrome, not a traced figure. Its "+N" text
        // matches the dev coverage sweep's stat pattern, hence the exempt
        // stamp. The title reveals only which SYMBOLS are hidden; the values
        // live on the surfaces that trace them.
        <span
          data-prov-exempt=""
          title={quiet ? undefined : hidden.map((a) => a.symbol).join(", ")}
          className="relative inline-flex items-center justify-center rounded-full bg-raised text-[10px] font-semibold tabular-nums text-rb-500"
          style={{ marginLeft: -overlap, zIndex: 0, width: size + 4, height: size + 4 }}
        >
          +{hidden.length}
        </span>
      )}
    </span>
  );
}
