// Reader-facing prose for the Maple pools view lives HERE, not in
// maple-pools-view.tsx. The register gate scans intro surfaces whole-file, and
// the view's code legitimately reads the pools' `totalAssets` field — an
// identifier the gate bans in copy. So discovery swaps the view file for this
// module (INTRO_SCAN_SWAPS in scripts/lib/register-scan.mjs): any new visible
// copy for the pools view must be added here, where the gate can hold it.

import type { MaplePoolState } from "@/lib/sources/chain/maple-pool-state";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { BlockRef } from "@/components/shared/block-ref";

/** The view's chain-snapshot stamp: the block, and where the contract set and
 *  the cross-check come from — in plain words. */
export function MaplePoolsStamp({ pools }: { pools: MaplePoolState[] }) {
  const blockNumber = pools[0]?.blockNumber;
  if (blockNumber == null) return null;
  return (
    <p className="mt-2 text-[11px] text-rb-500">
      Chain snapshot · <BlockRef block={blockNumber} chainId={MAINNET_CHAIN_ID} /> · pool contracts as listed in
      Maple&rsquo;s{" "}
      <a
        href="https://github.com/maple-labs/address-registry"
        target="_blank"
        rel="noopener noreferrer"
        className="link-external"
      >
        published list of its contract addresses
      </a>{" "}
      · in each pool, the cash plus what is out on loans (and in any other strategy, a contract the pool puts money to
      work through) adds up to the pool&rsquo;s stated value exactly
    </p>
  );
}

/** Under a pool card's split: the two loan lines are the figure the listing
 *  and wallet pages call "Deployed to loans", and what each kind is. */
export function MapleLoansNote() {
  return (
    <div className="mt-1.5 text-[11px] text-rb-500">
      Fixed-term plus open-term loans are the &ldquo;Deployed to loans&rdquo; figure on the listing and wallet pages. A
      fixed-term loan runs to a maturity date; an open-term loan has none, and Maple can call it for repayment with
      notice.
    </div>
  );
}

/** The residual line under a pool card's split, shown only when a strategy leg
 *  did not resolve at this block. `over` — the split reads over (true) or
 *  short of (false) the pool's stated value. */
export function MapleResidualNote({ display, symbol, over }: { display: string; symbol: string; over: boolean }) {
  return (
    <div className="mt-1.5 text-[11px] text-rb-500">
      the split above reads {display} {symbol} {over ? "over" : "short of"} the pool&rsquo;s stated value — a strategy
      leg did not resolve at this block
    </div>
  );
}

/** The pools card's tips on its two per-share rates, in lender words. The NAV
 *  is glossed here once; everywhere else the page says "exit rate". */
export const mapleNavTip = (block: number): string =>
  `NAV (net asset value) per share: the pool's value divided by its shares, read at block ${block}. The exit rate beside it is what a withdrawal pays; the two differ only while a loan is marked as impaired.`;
export const mapleExitTip = (block: number): string =>
  `Exit rate: what one share pays out on withdrawal, read at block ${block}.`;
export const MAPLE_NO_IMPAIRMENT_TIP =
  "No loan is marked as impaired, so a share's value and what it pays out on withdrawal are the same.";
