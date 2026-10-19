"use client";

// The chain's mark beside an explorer's name (ChainMark).

import { ARBITRUM_CHAIN_ID, BASE_CHAIN_ID, SEPOLIA_CHAIN_ID, type ChainId } from "@/lib/shared/chains";

// Base's mark is a rounded-corner square in Base blue (#0000FF) — the 2025
// brand, taken from the brand kit's chain-light.svg (a 1280-unit rounded
// square, corner radius ~7.9% of the side). Drawn as a <rect> with the same
// radius ratio so the corners can't be subtly wrong, and filled with the
// brand blue rather than currentColor: the mark is the chain's colour, not
// the text's, on both themes.
function BaseMark() {
  return <rect x="0" y="0" width="122" height="122" rx="9.64" fill="#0000FF" />;
}

// Sepolia is an Ethereum testnet and wears the Ethereum diamond as an OUTLINE
// in the surrounding ink — the silhouette names the family, the empty interior
// says it is not the real one. Neutral rather than a brand colour: a testnet
// has no brand, and the mark's job is to keep a Sepolia figure from being
// read as a mainnet one.
function SepoliaMark() {
  return (
    <g fill="none" stroke="currentColor" strokeWidth="22" strokeLinejoin="round">
      <path d="M128 12 L244 212 L128 288 L12 212 Z" />
      <path d="M128 312 L244 236 L128 405 L12 236 Z" />
    </g>
  );
}

/** Arbitrum's mark, the mono hexagon (viewBox 0 0 1080 1218.5), shared with
 *  ChainGlyph. It paints in the surrounding ink on both surfaces: Base's blue
 *  square is the one brand colour among the marks. */
export const ARBITRUM_MARK_PATH =
  "M 531.6 77.8 L 83.9 336.3 C 78.7 339.3 75.5 344.8 75.5 350.8 L 75.5 867.8 C 75.5 873.7 78.7 879.3 83.9 882.3 L 152.784 922.043 L 369.8 327.1 C 372.7 319.1 380.3 313.8 388.8 313.8 L 502.3 313.8 C 509.4 313.8 514.3 320.8 511.8 327.4 L 270.202 989.787 L 270.233 989.805 L 285.1 949.1 L 328.395 985.083 L 568.4 327.1 C 571.3 319.1 578.9 313.8 587.4 313.8 L 700.9 313.8 C 707.9 313.8 712.8 320.8 710.4 327.4 L 434.279 1084.451 L 531.6 1140.6 C 534.2 1142 537.1 1142.8 540 1142.8 C 542.9 1142.8 545.9 1142.1 548.4 1140.6 L 646.528 1083.941 L 571.3 877.6 C 569.7 873.1 569.7 868.2 571.3 863.7 L 630.3 701.9 C 633.5 693 646.1 693 649.3 701.9 L 763.923 1016.157 L 810.597 989.208 L 670.6 605.5 C 669 601 669 596.1 670.6 591.6 L 729.6 429.8 C 732.8 420.9 745.4 420.9 748.6 429.8 L 927.998 921.422 L 996.1 882.1 C 1001.3 879.1 1004.5 873.6 1004.5 867.6 L 1004.5 350.7 C 1004.5 344.8 1001.3 339.2 996.1 336.2 L 548.4 77.7 C 545.8 76.3 542.9 75.5 540 75.5 Z M 586.2 12.4 L 1034 270.8 C 1062.6 287.3 1080.2 317.8 1080.2 350.8 L 1080.2 867.7 C 1080.2 900.7 1062.6 931.2 1034 947.7 L 586.3 1206.2 C 572 1214.5 556 1218.6 540.1 1218.6 C 524.1 1218.6 508.2 1214.4 493.9 1206.2 L 290.528 1088.774 L 290.5 1088.8 L 243.9 1061.9 L 126.5 994.1 L 126.511 994.071 L 46.2 947.7 C 17.6 931.2 0 900.7 0 867.7 L 0 350.8 C 0 317.8 17.6 287.3 46.2 270.8 L 493.8 12.4 C 508.1 4.1 524.1 0 540 0 C 555.9 0 571.9 4.1 586.2 12.4 Z";

/** The chain as a MARK, not a word. Ethereum is the default and gets nothing;
 *  a Base explorer carries this square beside its protocol wordmark (header,
 *  bookmarks, coverage) in place of a " Base" suffix on the name — the rail is
 *  "Aave V3", the chain is where it runs. Base blue, sized by the caller's
 *  className, announced to a reader as "on Base". A Sepolia explorer carries
 *  the outlined diamond the same way, announced as "on Sepolia", and an
 *  Arbitrum one the mono hexagon, announced as "on Arbitrum". Renders null on
 *  any other chain so a call site can pass whatever chain it has. */
export function ChainMark({ chainId, className = "" }: { chainId: ChainId; className?: string }) {
  if (chainId === SEPOLIA_CHAIN_ID) {
    return (
      <svg
        viewBox="0 0 256 417"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="on Sepolia"
        className={`shrink-0 ${className}`}
      >
        <SepoliaMark />
      </svg>
    );
  }
  if (chainId === ARBITRUM_CHAIN_ID) {
    return (
      <svg
        viewBox="0 0 1080 1218.5"
        fill="currentColor"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="on Arbitrum"
        className={`shrink-0 ${className}`}
      >
        <path d={ARBITRUM_MARK_PATH} />
      </svg>
    );
  }
  if (chainId !== BASE_CHAIN_ID) return null;
  return (
    <svg
      viewBox="0 0 122 122"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="on Base"
      className={`shrink-0 ${className}`}
    >
      <BaseMark />
    </svg>
  );
}
