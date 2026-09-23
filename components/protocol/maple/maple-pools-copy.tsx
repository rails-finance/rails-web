// Reader-facing prose for the Maple pools view lives HERE, not in
// maple-pools-view.tsx. The register gate scans intro surfaces whole-file, and
// the view's code legitimately reads the pools' `totalAssets` field — an
// identifier the gate bans in copy. So discovery swaps the view file for this
// module (INTRO_SCAN_SWAPS in scripts/lib/register-scan.mjs): any new visible
// copy for the pools view must be added here, where the gate can hold it.

import type { MaplePoolState } from "@/lib/sources/chain/maple-pool-state";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";

/** The view's chain-snapshot stamp: the block, and where the contract set and
 *  the cross-check come from — in plain words. */
export function MaplePoolsStamp({ pools }: { pools: MaplePoolState[] }) {
  const blockNumber = pools[0]?.blockNumber;
  if (blockNumber == null) return null;
  return (
    <p className="mt-2 text-[11px] text-rb-500">
      Chain snapshot · block{" "}
      <a
        href={explorerUrl(MAINNET_CHAIN_ID, "block", blockNumber)}
        target="_blank"
        rel="noopener noreferrer"
        className="link-external"
      >
        {blockNumber.toLocaleString("en-US")}
      </a>{" "}
      · contract set from Maple&rsquo;s own{" "}
      <a
        href="https://github.com/maple-labs/address-registry"
        target="_blank"
        rel="noopener noreferrer"
        className="link-external"
      >
        address registry
      </a>{" "}
      · the strategy list is the pool&rsquo;s own on-chain record, and cash plus strategy holdings adds up to the
      pool&rsquo;s stated value exactly
    </p>
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
