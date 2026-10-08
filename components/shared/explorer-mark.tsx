"use client";

// The chain's mark beside an explorer's name (ChainMark).

import { BASE_CHAIN_ID, SEPOLIA_CHAIN_ID, type ChainId } from "@/lib/shared/chains";

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

/** The chain as a MARK, not a word. Ethereum is the default and gets nothing;
 *  a Base explorer carries this square beside its protocol wordmark (header,
 *  bookmarks, coverage) in place of a " Base" suffix on the name — the rail is
 *  "Aave V3", the chain is where it runs. Base blue, sized by the caller's
 *  className, announced to a reader as "on Base". A Sepolia explorer carries
 *  the outlined diamond the same way, announced as "on Sepolia". Renders null
 *  on any other chain so a call site can pass whatever chain it has. */
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
