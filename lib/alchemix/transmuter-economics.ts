// Transmuter position economics: the lifetime flows the tower draws.
// ----------------------------------------------------------------------------
// Pure, over the position's own summary. A Transmuter position's whole life is
// one stake and at most one claim, so the tower has two sides in two units and
// no USD, for the reason the Alchemist tower gives: a lifetime of flows valued
// at one price would state a figure no block supports.
//
//   • The STAKE side, in the synthetic: what went in, what is still staked, and
//     at the claim, the part converted and the part handed back. The converted
//     part is the stake less the returned part, two logged figures.
//   • The PAYOUT side, in vault shares: what the claim paid out, its one bar. The payout is
//     the converted part in another unit, so it is never added to the stake
//     side, and the two sides share no scale.

import type { ChainTruthTowerData, TowerLine } from "@/lib/shared/chain-truth-economics";
import type { AlchemixCoords } from "@/lib/alchemix/event-provenance";
import { transmuterConvertedProv, transmuterEmittedProv } from "@/lib/alchemix/transmuter-provenance";
import type { AlchemixTransmuterPositionSummary } from "@/types/api/alchemix";

const scaled = (raw: string): number => Number(raw.split(".")[0]) / 1e18;

export interface TransmuterEconomicsCoords {
  /** The stake's own log, for the receipts on the stake side. */
  stake: AlchemixCoords;
  /** The claim's own log, where there is one. */
  claim: AlchemixCoords | null;
}

export function computeTransmuterEconomics(
  p: AlchemixTransmuterPositionSummary,
  coords: TransmuterEconomicsCoords,
): ChainTruthTowerData {
  const sym = p.syntheticSymbol;
  const myt = p.claim?.claimed?.symbol ?? p.mytSymbol ?? "vault shares";
  const staked = scaled(p.staked.raw);
  const claim = p.claim;
  const claimCoords = coords.claim ?? coords.stake;

  const exited: TowerLine[] = [];
  if (claim?.unclaimed) {
    const returnedRaw = BigInt(claim.unclaimed.raw.split(".")[0]);
    const convertedRaw = BigInt(p.staked.raw.split(".")[0]) - returnedRaw;
    if (convertedRaw > BigInt(0)) {
      exited.push({
        key: "stake-converted",
        symbol: sym,
        amount: Number(convertedRaw) / 1e18,
        usd: null,
        prov: transmuterConvertedProv(sym, p.staked.raw, claim.unclaimed.raw, claimCoords),
        flowLabel: "Converted",
      });
    }
    if (returnedRaw > BigInt(0)) {
      exited.push({
        key: "stake-returned",
        symbol: sym,
        amount: Number(returnedRaw) / 1e18,
        usd: null,
        prov: transmuterEmittedProv("amount_unclaimed", sym, claim.unclaimed.raw, claimCoords),
        flowLabel: "Handed back",
      });
    }
  }

  return {
    valued: false,
    collateral: {
      current:
        p.status === "outstanding"
          ? [
              {
                key: "stake-current",
                symbol: sym,
                amount: staked,
                usd: null,
                prov: transmuterEmittedProv("amount_staked", sym, p.staked.raw, coords.stake),
              },
            ]
          : [],
      exited,
      liquidated: [],
      lifetimeInflow: staked,
    },
    debt: {
      // The payout is the side's one figure, drawn once as its bar; there is no
      // inflow behind it to fade against.
      current:
        claim?.claimed && BigInt(claim.claimed.raw.split(".")[0]) > BigInt(0)
          ? [
              {
                key: "payout",
                symbol: myt,
                amount: scaled(claim.claimed.raw),
                usd: null,
                prov: transmuterEmittedProv("amount_claimed", myt, claim.claimed.raw, claimCoords),
              },
            ]
          : [],
      exited: [],
      liquidated: [],
      lifetimeInflow: 0,
    },
    collateralUnit: sym,
    debtUnit: myt,
    collateralTitle: "Staked",
    debtTitle: "Payout",
    collateralInflowLabel: "Staked",
  };
}
