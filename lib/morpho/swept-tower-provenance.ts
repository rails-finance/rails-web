// Tower receipts for the INDEX-FREE Morpho lane, as a factory.
// ----------------------------------------------------------------------------
// The Ethereum tower and the Base one run the same arithmetic (economics.ts is
// shared), but they are not making the same claim about custody, and the
// receipt is where that has to be said rather than glossed:
//
//   • On Ethereum the replayed figures come out of the rails-server index —
//     captured logs, reduced by mig 045's MV. On Base there is no index: the
//     route sweeps the singleton's own logs for this request, from the
//     contract's first block, and replays them itself. That is what lets these
//     receipts say "every event the singleton has emitted for this position"
//     where the Ethereum wording says "captured history".
//   • What does NOT change is the arithmetic, or its proof. Collateral and
//     borrow SHARES are conserved quantities, so a replay of either equals the
//     `position(id, user)` slot to the wei whenever the sweep was whole — the
//     same third-party check the Ethereum receipts already offer.
//
// A factory rather than a per-chain module because only two things vary — the
// chain the links point at, and the block the sweep floors at — and the
// builders themselves already take a coordinate carrying both.

import type { ChainId } from "@/lib/shared/chains";
import type { MorphoTowerVocabulary } from "./economics";
import {
  positionCollateralProv,
  positionBorrowedProv,
  morphoCurrentDebtProv,
  morphoFlowProv,
  type MorphoCoords,
} from "./event-provenance";

export interface SweptMorphoIdentity {
  chainId: ChainId;
  /** The singleton's first block on this chain — the floor every sweep starts at. */
  deployBlock: number;
}

/** Build the tower receipts for one swept Morpho deployment. */
export function makeSweptMorphoTowerVocabulary(id: SweptMorphoIdentity): MorphoTowerVocabulary {
  const coords: MorphoCoords = { chainId: id.chainId, source: "sweep" };
  const floor = ` · from the singleton's first block (${id.deployBlock.toLocaleString("en-US")})`;
  const withFloor = (p: ReturnType<typeof positionCollateralProv>) => ({ ...p, via: `${p.via ?? ""}${floor}` });
  return {
    collateral: (symbol, atBlock) => withFloor(positionCollateralProv(symbol, atBlock, coords)),
    borrowed: (symbol, atBlock) => withFloor(positionBorrowedProv(symbol, atBlock, coords)),
    currentDebt: (symbol, sharesHuman, totalBorrowAssets, totalBorrowShares) =>
      morphoCurrentDebtProv(symbol, sharesHuman, totalBorrowAssets, totalBorrowShares, coords),
    flow: (flow, symbol) => withFloor(morphoFlowProv(flow, symbol, coords)),
  };
}
