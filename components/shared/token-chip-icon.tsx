"use client";

// Token chip with a single render path and an ordered source fallback:
//   1. Local PNG by symbol — the curated, self-hosted set in
//      public/icons/tokens (e.g. usdc.png, wbtc.png, eth.png).
//   2. Local PNG by address — for assets stored under their token address
//      rather than a symbol (e.g. LINK/USDT/EURC).
//   3. Trust Wallet CDN — by address, for anything not self-hosted.
//   4. DeFiLlama icons CDN — for DeFi-native assets Trust Wallet hasn't
//      indexed (cbBTC, rsETH, LBTC at time of writing).
//   5. UnknownTokenSvg placeholder — same visual vocabulary as Etherscan's
//      empty-token glyph; reads as "unknown" rather than a brand mark.
//
// Every source renders through the same <img> at the full `size` envelope —
// no per-source scaling. Earlier code special-cased SVG sprites at 0.88x to
// guess around CDN logo padding; that magic number was right for some logos
// and wrong for others (sprites came out visibly smaller than CDN icons in
// the same cluster). Consolidating onto the curated local PNGs, which are
// uniformly full-bleed, removes the guesswork. See getLocalTokenIcon.
//
// Plain <img> with onError fallback (vs next/image) avoids needing a
// next.config remotePatterns entry for raw.githubusercontent.com or
// token-icons.llamao.fi. Icons are 16-28px so optimization isn't
// load-bearing.

import { createContext, useContext, useState } from "react";
import { UnknownTokenSvg } from "@/components/shared/unknown-token-svg";
import { useChainId } from "@/lib/shared/chain-context";
import { BASE_CHAIN_ID, MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { getLocalTokenIcon } from "@/lib/shared/local-token-icons";
import { PT_UNDERLYING_BASE, PT_UNDERLYING_MAINNET } from "@/lib/shared/pt-underlying";
import { getTokenAddress } from "@/lib/shared/token-addresses";
import { getDefiLlamaLogoUrl, getTokenLogoUrl } from "@/lib/shared/token-logo";

const TokenFilterCtx = createContext<((symbol: string) => void) | null>(null);
export function useTokenFilterCtx() {
  return useContext(TokenFilterCtx);
}

// Trust Wallet doesn't host a logo for some assets, but the brand is shared
// with another asset that IS hosted. For those, look up the icon under the
// brand-mark address instead of the canonical token address. The canonical
// address used everywhere else stays correct.
const LOGO_ADDRESS_OVERRIDES: Record<string, string> = {
  // frxUSD/sfrxUSD share the FRAX brand mark (logo.png exists for v1 FRAX).
  frxUSD: "0x853d955aCEf822Db058eb8505911ED77F175b99e",
  sfrxUSD: "0x853d955aCEf822Db058eb8505911ED77F175b99e",
  // Pendle PTs used to sit here as two hand-written keys. They no longer do:
  // a PT's underlying is now read from the PT contract itself and the chip
  // wears a "PT" badge over the mark (PT_UNDERLYING below, PtBadge at the
  // foot of this file). The two keys were also both dead against real data —
  // "PT-sUSDE" and "PT-USDe-7MAY2026" are undated and mis-dated forms of
  // symbols the chain actually spells "PT-sUSDE-27MAR2025", "PT-sUSDE-7MAY2026"
  // and so on, one per maturity. Two entries could never have covered 149 of
  // them, which is the reason the mechanism changed rather than the list grew.
};

// A wrapper or receipt token that wears its underlying's mark — the way ETH
// wears WETH's below. Seamless's ILM "Reserved" tokens (rWETH, rUSDC …) are
// that Pool's leverage-vault receipts for the named reserve; wcbBTC is
// basedollar's wrapped cbBTC. None has a mark of its own on any source, and a
// letter would say less than the brand does. The label text stays the
// token's own symbol.
const ICON_SYMBOL_ALIASES: Record<string, string> = {
  wcbBTC: "cbBTC",
  // Asymmetry's collateral is the 18-decimal wrapper of each BTC asset, not the
  // 8-decimal asset itself — two distinct contracts, and only the underlying has
  // a mark (WBTC18 0xe065Bc16…, cbBTC18 0x7fD713fe… are on neither CDN).
  WBTC18: "WBTC",
  cbBTC18: "cbBTC",
  // Yearn's staked yBOLD wears yBOLD's own "Yb" mark, the way stkWELL wears
  // WELL's. Before this it drew sDOLA's — see the TOKEN_ADDRESSES entry.
  ysyBOLD: "yBOLD",
  // Moonwell's staked-governance receipt. WELL has a mark on both CDNs under
  // its Base address; stkWELL has one on neither.
  stkWELL: "WELL",
  rWETH: "WETH",
  rUSDC: "USDC",
  rcbBTC: "cbBTC",
  rweETH: "weETH",
  rwstETH: "wstETH",
};

export interface TokenChipIconProps {
  symbol: string;
  /** Resolve the icon under a different symbol than the one shown/filtered on
   *  — a receipt token (Moonwell's mUSDC, mMAMO …) wearing its underlying's
   *  mark, the way ICON_SYMBOL_ALIASES does for the fixed wrapper set above,
   *  but for a caller who knows the underlying at the call site instead. */
  iconOverride?: string;
  address?: string;
  size?: number;
  onClick?: () => void;
  filterable?: boolean;
}

export function TokenChipIcon({
  symbol,
  iconOverride,
  address,
  size = 16,
  onClick,
  filterable = true,
}: TokenChipIconProps) {
  const ctxFilter = useTokenFilterCtx();
  const chainId = useChainId();
  const handler = onClick ?? (filterable && ctxFilter ? () => ctxFilter(symbol) : undefined);
  const clickable = !!handler;
  const clickProps = clickable
    ? {
        onClick: (e: React.MouseEvent) => {
          e.stopPropagation();
          handler!();
        },
        role: "button" as const,
        title: `Filter by ${symbol}`,
      }
    : {};
  const clickClass = clickable
    ? "cursor-pointer hover:ring-2 hover:ring-rb-400 dark:hover:ring-rb-500 rounded-full transition-shadow"
    : "";

  // Build the ordered source list. Symbol-level address overrides win so
  // brand-shared assets (frxUSD → FRAX) borrow another asset's logo without
  // polluting the canonical TOKEN_ADDRESSES map.
  // The CDNs key by (chain, address). An address the caller handed in, or
  // one the page's chain's own table names, is looked up under that chain;
  // failing both, the Ethereum table — the brand mark is the same on every
  // chain, so a Base page drawing "USDC" by symbol alone still finds it. The
  // overrides are Ethereum addresses by construction.
  const rawLookup = iconOverride ?? symbol;
  // A principal token is a dated claim on another asset, and no CDN
  // hosts a mark for one — every PT address 404s on both tiers. Since every
  // such symbol begins "PT-", the letter glyph made all 149 of them (9,359
  // Morpho positions at the time of writing) draw the same anonymous "P".
  //
  // So the chip resolves the mark of the asset the claim is ON, taken from the
  // PT's own contract (Pendle SY().yieldToken(), Spectra getIBT()) rather than
  // parsed out of its name — the symbol
  // string is not the identity, and "PT-sUSDE-…" names an asset the house
  // table spells "sUSDe". Wearing the underlying's mark unqualified would then
  // say the wrong thing in the other direction, so isPt stamps a badge over it.
  // The two answer different questions: the mark says what the claim is on,
  // the badge says that it is a claim.
  //
  // A PT the generated map has not seen — a market listed since the last run —
  // keeps the letter, and still gets the badge.
  const ptTable = chainId === BASE_CHAIN_ID ? PT_UNDERLYING_BASE : PT_UNDERLYING_MAINNET;
  const ptUnderlying = address ? ptTable[address.toLowerCase()] : undefined;
  const isPt = /^PT-/i.test(rawLookup);
  // Resolve as though the caller had asked for the underlying — symbol AND
  // address, so the local-PNG tiers get their chance too. The PT's own address
  // must not survive into `onChain`; the ?? order is what drops it.
  const lookupBase = ptUnderlying?.[1] ?? rawLookup;
  const aliased = ICON_SYMBOL_ALIASES[lookupBase];
  const lookup = aliased ?? lookupBase;
  const override = LOGO_ADDRESS_OVERRIDES[lookup];
  // An address is only meaningful paired with the symbol it belongs to. Once an
  // alias fires, the mark being drawn is the UNDERLYING's, so the caller's
  // address — the wrapper's own contract — names the wrong asset and must be
  // dropped the same way the PT's own address is above. Keeping it is not a
  // near miss but a dead end: basedollar's wcbBTC chips carried their own Base
  // contract, both CDNs 404 it, and the alias to cbBTC (whose mark IS local)
  // could never be reached.
  const onChain = ptUnderlying?.[0] ?? (aliased ? undefined : address) ?? getTokenAddress(lookup, chainId);
  const resolvedAddress = override ?? onChain ?? getTokenAddress(lookup, MAINNET_CHAIN_ID);
  const cdnChain = !override && onChain ? chainId : MAINNET_CHAIN_ID;

  const srcs: string[] = [];
  // 1. Local PNG by symbol (the curated set is mostly symbol-named).
  //    "ETH" resolves to the dark "wrapped" mark (weth.png) — the in-protocol
  //    Ethereum glyph shared with WETH across every explorer. The plain blue
  //    ether icon is reserved for gas, which looks it up under "ether" (see
  //    trove-economics). So an ETH collateral/position reads the same as WETH,
  //    while the label text stays "ETH".
  const iconSymbol = lookup.toLowerCase() === "eth" ? "weth" : lookup;
  const localBySymbol = getLocalTokenIcon(iconSymbol);
  if (localBySymbol) srcs.push(localBySymbol);
  // 2. Local PNG by address (LINK/USDT/EURC etc. are address-named only).
  if (resolvedAddress) {
    const localByAddress = getLocalTokenIcon(resolvedAddress);
    if (localByAddress && localByAddress !== localBySymbol) srcs.push(localByAddress);
    // 3 + 4. CDN tiers, by address — null on a chain neither CDN indexes (a
    //        testnet), where the local tier above is the only source.
    for (const url of [getTokenLogoUrl(resolvedAddress, cdnChain), getDefiLlamaLogoUrl(resolvedAddress, cdnChain)]) {
      if (url) srcs.push(url);
    }
  }

  const chip =
    srcs.length === 0 ? (
      <UnknownTokenSvg size={size} symbol={symbol} clickProps={clickProps} clickClass={clickClass} />
    ) : (
      <FallbackTokenIcon symbol={symbol} srcs={srcs} size={size} clickClass={clickClass} clickProps={clickProps} />
    );
  if (!isPt) return chip;
  return (
    <PtBadge size={size} underlying={ptUnderlying?.[1]}>
      {chip}
    </PtBadge>
  );
}

/** The "PT" stamp over a principal token's chip — the underlying's mark says
 *  what the claim is on, this says it is a claim and not the asset itself.
 *  That distinction is load-bearing where both appear together, which on a
 *  Morpho market is the normal case: PT-sUSDE-27MAR2025 collateral against a
 *  USDe loan, beside a plain sUSDe market on the same listing.
 *
 *  Below 20px the badge is dropped rather than shrunk. The two letters stop
 *  being letters somewhere around 5px, and every chip that small in this
 *  codebase (the tower's 12s and 14s, the event flows' 16s) renders with the
 *  token's own symbol beside it — text that already begins "PT-" and carries
 *  the maturity besides. An illegible smudge there would be decoration, not
 *  information. The sizes that DO get the badge are the ones that need it: the
 *  28px headline chip in <AssetAmount>, and <InlineAssetCluster>, which draws
 *  icons alone with no label anywhere near them. */
function PtBadge({ size, underlying, children }: { size: number; underlying?: string; children: React.ReactNode }) {
  if (size < 20) return <>{children}</>;
  const height = Math.round(size * 0.44);
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      {children}
      <span
        // Top-right, because bottom-right is spoken for: the spine's external
        // actor / party glyph anchors there on every explorer (four sites in
        // spine-column.tsx, all "-bottom-0.5 -right-0.5"), and an Add Collateral
        // by a third party into a PT market puts both on one chip. Stacked
        // there they occluded each other; the two corners keep both readable.
        //
        // Neutral by construction: this is a fact about the instrument, not a
        // status, so it takes the rb greys rather than any signalling hue.
        className="absolute -top-px -right-px inline-flex items-center justify-center rounded-[3px] bg-background font-semibold leading-none text-rb-600 ring-1 ring-rb-300 dark:text-rb-300 dark:ring-rb-600"
        style={{ height, paddingInline: Math.max(1, Math.round(size * 0.07)), fontSize: Math.round(size * 0.3) }}
        title={
          underlying ? `Principal token \u2014 a dated claim on ${underlying}` : "Principal token \u2014 a dated claim"
        }
      >
        PT
      </span>
    </span>
  );
}

/** Renders the first source that loads, advancing through the ordered list on
 *  each onError and ending at UnknownTokenSvg once every source has 404'd.
 *  State is per-instance so one failed icon doesn't disturb its siblings. */
function FallbackTokenIcon({
  symbol,
  srcs,
  size,
  clickClass,
  clickProps,
}: {
  symbol: string;
  srcs: string[];
  size: number;
  clickClass: string;
  clickProps: Record<string, unknown>;
}) {
  const [idx, setIdx] = useState(0);
  const advance = () => setIdx((i) => i + 1);
  if (idx >= srcs.length) {
    return <UnknownTokenSvg size={size} symbol={symbol} clickProps={clickProps} clickClass={clickClass} />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={idx}
      // Every position page renders on the server, so the browser starts this
      // request from the server's HTML and can finish it — including 404ing —
      // before React hydrates and attaches onError. The error event is not
      // replayed, so a chip whose FIRST source is missing sits on a broken
      // <img> forever: it never advances to the next CDN and never reaches the
      // letter glyph either, which is how a Morpho market's PT collateral drew
      // ten blank squares on a page the icon census scored as fully resolved.
      // A mounted image that reports `complete` with no intrinsic width has
      // already failed, and this is the only moment we can learn that.
      ref={(el) => {
        if (el && el.complete && el.naturalWidth === 0) advance();
      }}
      src={srcs[idx]}
      alt={symbol}
      width={size}
      height={size}
      className={`block shrink-0 rounded-full ${clickClass}`}
      onError={advance}
      {...(clickProps as React.HTMLAttributes<HTMLImageElement>)}
    />
  );
}
