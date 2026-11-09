// A row's lead zone (C20's tint on a table row): the protocol's mark and the
// chain's glyph on the protocol's tint. Drawn first on the wallet's History
// table and Trades row, and as the shared table's lead column
// (components/shared/data-table) where rows span protocols or chains.

import type { CSSProperties } from "react";
import { ProtocolIcon } from "@/components/icons/protocol-glyphs";
import { ChainGlyph } from "@/components/icons/chain-glyphs";
import { protocolBrand } from "@/lib/shared/protocols";
import { chainMeta, type ChainId } from "@/lib/shared/chains";

/** The protocol's brand hue for the zone and edge tokens; a grey zone where
 *  the roster has none. */
export function hueStyle(id: string): CSSProperties {
  const hue = protocolBrand(id)?.hue ?? null;
  return { "--brand-hue": hue ?? 0, ...(hue == null ? { "--brand-strength": 0 } : {}) } as CSSProperties;
}

/** The zone. `className` sets its size and corners: by default 95px wide,
 *  stretched to a flex row's height, its left corners inside a 16px card. */
export function RowZone({
  id,
  chain,
  className = "w-[95px] self-stretch rounded-l-[15px]",
}: {
  id: string;
  chain: ChainId;
  className?: string;
}) {
  return (
    <span
      className={`flex shrink-0 items-center justify-evenly bg-brand-zone ${className}`}
      style={hueStyle(id)}
      data-closed-zone={id}
    >
      <ProtocolIcon id={id} className="h-[18px] w-[18px] shrink-0 text-brand-mark [&:is(img)]:grayscale" />
      <span className="flex items-center text-brand-zone">
        <ChainGlyph id={chain} className="h-[18px] w-[18px] shrink-0" />
        <span className="sr-only">{chainMeta(chain).name}</span>
      </span>
    </span>
  );
}
