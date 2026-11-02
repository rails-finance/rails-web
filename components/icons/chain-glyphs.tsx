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
 *   Base: the rounded-corner square of the 2025 brand (base.org brand kit,
 *     corner radius 7.9% of the side).
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

/**
 * Home-page-only chain entries: choices on the home explorer toggle that have
 * no ChainId, no explorers and no place in CHAINS. Drop a mark in by replacing
 * `null` with a `Glyph` (monochrome paths, no baked-in colour), the same shape
 * as the marks above. A key with `null` renders no glyph.
 */
export type HomeOnlyChainKey = "robinhood";

// Robinhood's feather, from the SVG Miles supplied on 2 Nov 2026 (its baked-in
// white fill dropped for currentColor).
const ROBINHOOD_MARK: Glyph = {
  viewBox: "0 0 149.53 149.53",
  paths: [
    {
      d: "m73.96,33.73h-30.4c-1.1,0-2.03.44-2.8,1.4l-21.8,27c-3.2,4-4,7.7-4,13v27.6C7.86,122.63,3.36,136.13.06,148.33c-.2.78.1,1.2.8,1.2h3.3c.6,0,1.2-.3,1.4-.8C30.46,85.33,57.56,53.93,74.56,35.13c.7-.8.4-1.4-.6-1.4Z",
    },
    {
      d: "m74.86,2.63c-2.04.79-4,2.13-4.9,2.9-9,7.7-15,13.8-20.7,19.8-.7.7-.4,1.4.6,1.4h33.7c3.1,0,4.9,1.8,4.9,4.9v38c0,1,.8,1.3,1.4.4l20.3-26.5c3.3-4.3,4.3-5.6,5.2-11.6,1.2-8.8.5-22.3-4.8-27.9-4.7-5-25.9-5.2-35.7-1.4Z",
    },
    {
      d: "m79.96,41.33c-20.9,23.3-37.2,47.8-52.3,77.3-.38.74.1,1.4,1,1.1l31.2-9.6c3.52-1.08,5.5-2.5,7.2-5.3l13.9-22.9c.3-.6.4-1.3.4-1.8v-38.2c0-1-.7-1.4-1.4-.6Z",
    },
  ],
};

const HOME_ONLY_GLYPHS: Record<HomeOnlyChainKey, Glyph | null> = {
  robinhood: ROBINHOOD_MARK,
};

export function HomeOnlyChainGlyph({ id, className = "" }: { id: HomeOnlyChainKey; className?: string }): ReactNode {
  const glyph = HOME_ONLY_GLYPHS[id];
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
