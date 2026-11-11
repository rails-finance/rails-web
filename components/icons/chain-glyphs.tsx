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
 *   Optimism: the disc with "OP" cut out of it, the letters taken from the
 *     wordmark in Optimism's docs repo (ethereum-optimism/docs,
 *     public/logos/logo-docs-light.svg), the red dropped.
 *   Arc: the arch from the logo on Arc's docs (docs.arc.io, ARC_Doc_WHT.svg),
 *     the gradient dropped.
 *   Robinhood Chain: Robinhood's feather, from the SVG Miles supplied on
 *     2 Nov 2026, its baked-in white fill dropped.
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

const OPTIMISM_MARK: Glyph = {
  viewBox: "-6.8 -8.05 48 48",
  paths: [
    {
      // The disc (centred on the letters, radius 24), then "O" and "P"; evenodd
      // cuts the letters out and keeps their counters filled.
      d: "M-6.8 15.95a24 24 0 1 0 48 0a24 24 0 1 0-48 0ZM7.04 24.23C6.07 24.23 5.17 24.1 4.35 23.84C3.52 23.58 2.82 23.19 2.25 22.67C1.69 22.14 1.28 21.49 1.03 20.71C0.81 19.93 0.77 19.02 0.94 17.97C1.07 17.31 1.2 16.66 1.33 16C1.49 15.34 1.64 14.67 1.79 13.99C2.3 11.93 3.21 10.35 4.53 9.28C5.85 8.21 7.63 7.67 9.87 7.67C10.83 7.67 11.72 7.81 12.54 8.08C13.36 8.34 14.06 8.74 14.63 9.28C15.21 9.82 15.62 10.48 15.85 11.26C16.09 12.04 16.12 12.95 15.94 13.99C15.83 14.67 15.7 15.34 15.55 16C15.41 16.66 15.26 17.31 15.11 17.97C14.59 20.07 13.67 21.65 12.35 22.69C11.03 23.72 9.26 24.23 7.04 24.23ZM7.34 20.92C8.16 20.92 8.89 20.67 9.52 20.18C10.15 19.69 10.6 18.91 10.86 17.84C11.02 17.16 11.17 16.52 11.29 15.93C11.43 15.33 11.55 14.71 11.66 14.06C11.86 12.99 11.77 12.21 11.38 11.72C11 11.23 10.4 10.98 9.57 10.98C8.74 10.98 8.01 11.23 7.38 11.72C6.77 12.21 6.33 12.99 6.07 14.06C5.9 14.71 5.75 15.33 5.61 15.93C5.49 16.52 5.37 17.16 5.24 17.84C5.06 18.91 5.15 19.69 5.52 20.18C5.89 20.67 6.49 20.92 7.34 20.92ZM18.42 24C18.27 24 18.14 23.95 18.05 23.84C17.96 23.73 17.93 23.59 17.96 23.43L21.14 8.47C21.17 8.31 21.25 8.17 21.39 8.06C21.53 7.95 21.67 7.9 21.82 7.9H27.94C28.88 7.9 29.72 8.01 30.47 8.22C31.24 8.44 31.88 8.77 32.38 9.21C32.89 9.66 33.24 10.22 33.44 10.89C33.64 11.55 33.65 12.32 33.46 13.21C33.08 14.98 32.3 16.28 31.12 17.12C29.95 17.97 28.38 18.39 26.4 18.39H23.3L22.24 23.43C22.21 23.59 22.12 23.73 21.99 23.84C21.86 23.95 21.72 24 21.55 24H18.42ZM23.89 15.21H26.54C27.17 15.21 27.73 15.05 28.22 14.71C28.73 14.37 29.05 13.86 29.21 13.17C29.28 12.77 29.3 12.42 29.25 12.11C29.21 11.8 29.05 11.56 28.77 11.37C28.51 11.19 28.1 11.1 27.55 11.1H24.79L23.89 15.21Z",
      fillRule: "evenodd",
    },
  ],
};

const ARC_MARK: Glyph = {
  viewBox: "-1 0 48.7 48.73",
  paths: [
    {
      d: "M23.33 0C30.33 0 36.55 6.04 40.84 17.01C43.08 22.71 44.72 29.49 45.7 36.86C45.79 37.52 45.86 38.19 45.94 38.86C45.96 38.9 45.98 38.94 45.97 38.97C45.97 38.97 46.54 42.54 46.66 48.73H46.6C45.75 48.03 35.73 40.19 19.13 42.46C19.38 39.66 19.73 36.93 20.17 34.32C20.19 34.19 20.22 34.06 20.24 33.93C26.76 33.73 32.46 34.49 36.83 35.47C36.81 35.37 36.8 35.26 36.78 35.16C35.88 29.59 34.56 24.48 32.85 20.12C30.05 12.99 26.41 8.56 23.33 8.56C20.26 8.56 16.61 12.99 13.82 20.12C13.14 21.84 12.52 23.68 11.97 25.62C11.2 28.34 10.54 31.26 10.02 34.32C9.25 38.85 8.77 43.7 8.59 48.73H0C0.4 36.8 2.43 25.66 5.82 17.01C10.12 6.04 16.34 0 23.33 0Z",
    },
  ],
};

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

const GLYPHS: Partial<Record<ChainId, Glyph>> = {
  1: ETHEREUM_MARK,
  8453: BASE_MARK,
  42161: ARBITRUM_MARK,
  10: OPTIMISM_MARK,
  5042: ARC_MARK,
  4663: ROBINHOOD_MARK,
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
