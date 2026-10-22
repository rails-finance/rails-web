import type { ReactNode } from "react";
import type { ChainId } from "@/lib/shared/chains";
import type { Glyph } from "@/components/icons/protocol-glyphs";

/**
 * Monochrome chain glyphs, in the shape of `protocol-glyphs.tsx`: inline SVG
 * paths with no baked-in colour (`fill="currentColor"`), keyed by `ChainId`
 * from `lib/shared/chains.ts`. Each mark is the chain's brand mark reduced to
 * one colour and a short path:
 *
 *   Ethereum: the two halves of the octahedron (ethereum.org brand assets),
 *     the facet shading dropped.
 *   Base: the rounded-corner square of the 2025 brand (corner radius 7.9% of
 *     the side), the shape `ChainMark` in `components/shared/explorer-mark.tsx`
 *     draws in Base blue on the home page and the explorer headers.
 *   Arbitrum: the hexagon's ring with the "A" inside (arbitrum.io brand kit),
 *     the two-tone strokes drawn as one stroke per leg.
 *
 * Sepolia, Ethereum's testnet, takes the Ethereum mark.
 */

const ETHEREUM_MARK: Glyph = {
  viewBox: "-40 0 336 417",
  paths: [{ d: "M127.9 0 0 212.3l127.9 75.6 127.9-75.6zM127.9 312.2 0 236.6l127.9 180.3 127.9-180.3z" }],
};

const BASE_MARK: Glyph = {
  viewBox: "-8 -8 127 127",
  paths: [
    {
      d: "M12.9 5H97.1A7.9 7.9 0 0 1 105 12.9V97.1A7.9 7.9 0 0 1 97.1 105H12.9A7.9 7.9 0 0 1 5 97.1V12.9A7.9 7.9 0 0 1 12.9 5Z",
    },
  ],
};

const ARBITRUM_MARK: Glyph = {
  viewBox: "0 0 24 24",
  paths: [
    { d: "M12 1.2 21.4 6.6v10.8L12 22.8l-9.4-5.4V6.6zM12 3.3 4.4 7.7v8.6l7.6 4.4 7.6-4.4V7.7z", fillRule: "evenodd" },
    { d: "M6.9 17h2.1l3.7-9.3h-2.1zM11.4 11.4l1-2.6 3.4 8.2h-2.1zM14.4 10.2l1-2.5 4 9.7-1.2.7z" },
  ],
};

const GLYPHS: Partial<Record<ChainId, Glyph>> = {
  1: ETHEREUM_MARK,
  8453: BASE_MARK,
  42161: ARBITRUM_MARK,
  11155111: ETHEREUM_MARK,
};

export function ChainGlyph({ id, className = "" }: { id: ChainId; className?: string }): ReactNode {
  const glyph = GLYPHS[id];
  if (!glyph) return null;
  return (
    <svg
      viewBox={glyph.viewBox}
      className={className}
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {glyph.paths?.map((p, i) => (
        <path key={i} d={p.d} fillRule={p.fillRule} />
      ))}
    </svg>
  );
}
